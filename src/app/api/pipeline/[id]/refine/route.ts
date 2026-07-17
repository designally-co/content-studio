import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drafts, refinements } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { loadProject, pipelineContext } from "@/lib/projects";
import {
  getModels,
  buildSystemPrompt,
  streamText,
  isAnthropicConfigured,
} from "@/lib/anthropic";
import { refineTask } from "@/prompts/tasks";
import { logUsage } from "@/lib/cost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) return new Response("Empty message", { status: 400 });

  const loaded = await loadProject(id);
  if (!loaded) return new Response("Not found", { status: 404 });
  if (!(await isAnthropicConfigured()))
    return new Response("The Anthropic API key is not configured", { status: 503 });
  const selected = loaded.drafts.find((d) => d.isSelected) ?? loaded.drafts[0];
  if (!selected) return new Response("No selected draft", { status: 400 });

  const ctx = pipelineContext(loaded);
  const { drafting } = await getModels();
  const longForm = loaded.articleRules.longForm;
  const bothLang = ctx.language === "both";
  const maxTokens = longForm ? (bothLang ? 12000 : 8000) : bothLang ? 4000 : 3000;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { text, usage } = await streamText({
          model: drafting,
          system: buildSystemPrompt(ctx),
          task: refineTask({ currentDraft: selected.contentMd, userMessage: message }),
          maxTokens,
          onDelta: (d) => send(controller, { t: "delta", d }),
        });

        const { tokensIn, tokensOut, costUsd } = await logUsage({
          projectId: id,
          stage: "refine",
          model: drafting,
          usage,
        });

        const db = await getDb();
        await db.insert(refinements).values({
          projectId: id,
          draftId: selected.id,
          userMessage: message,
          resultMd: text,
          tokensIn,
          tokensOut,
          costUsd: costUsd.toFixed(6),
        });
        await db
          .update(drafts)
          .set({ contentMd: text })
          .where(eq(drafts.id, selected.id));

        send(controller, { t: "done", tokensIn, tokensOut, costUsd });
      } catch (err) {
        send(controller, {
          t: "error",
          m: err instanceof Error ? err.message : "Refinement failed",
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
