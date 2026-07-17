import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drafts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { loadProject, pipelineContext } from "@/lib/projects";
import {
  getModels,
  buildSystemPrompt,
  streamText,
  isAnthropicConfigured,
} from "@/lib/anthropic";
import { draftTask } from "@/prompts/tasks";
import { logUsage } from "@/lib/cost";
import { countMetrics } from "@/lib/text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as { variation?: number };
  const variation = Math.min(Math.max(body.variation ?? 1, 1), 3);

  const loaded = await loadProject(id);
  if (!loaded) return new Response("Not found", { status: 404 });
  if (!(await isAnthropicConfigured()))
    return new Response("The Anthropic API key is not configured", { status: 503 });
  const outline = loaded.project.outline?.markdown;
  if (!outline) return new Response("No approved outline", { status: 400 });

  const ctx = pipelineContext(loaded);
  const { drafting } = await getModels();
  const longForm = loaded.articleRules.longForm;
  const bothLang = ctx.language === "both";
  const maxTokens = longForm ? (bothLang ? 12000 : 8000) : bothLang ? 4000 : 3000;

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    obj: unknown
  ) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { text, usage } = await streamText({
          model: drafting,
          system: buildSystemPrompt(ctx),
          task: draftTask({ outlineMarkdown: outline, variation, longForm }),
          maxTokens,
          onDelta: (d) => send(controller, { t: "delta", d }),
        });

        const { tokensIn, tokensOut, costUsd } = await logUsage({
          projectId: id,
          stage: `draft:${variation}`,
          model: drafting,
          usage,
        });

        // Persist (replace any prior draft for this variation).
        const db = await getDb();
        await db
          .delete(drafts)
          .where(and(eq(drafts.projectId, id), eq(drafts.variationNo, variation)));
        const [row] = await db
          .insert(drafts)
          .values({
            projectId: id,
            variationNo: variation,
            contentMd: text,
            isSelected: false,
            tokensIn,
            tokensOut,
            costUsd: costUsd.toFixed(6),
          })
          .returning();

        const metric = countMetrics(text);
        send(controller, {
          t: "done",
          draftId: row.id,
          tokensIn,
          tokensOut,
          costUsd,
          metricLabel: metric.label,
        });
      } catch (err) {
        send(controller, {
          t: "error",
          m: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
    },
  });
}
