import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drafts, refinements } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { loadProject, pipelineContext } from "@/lib/projects";
import {
  getModels,
  buildSystemLayers,
  streamText,
  isAnthropicConfigured,
} from "@/lib/anthropic";
import { draftTask } from "@/prompts/tasks";
import { extractOutlineSources } from "@/lib/outline";
import { countMetrics, deDash } from "@/lib/text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * Streaming a whole article is the longest thing this app does: up to 8,000
 * tokens, or 12,000 for a paired TH+EN draft. 60 is the most every Vercel plan
 * allows and is probably still short for a long-form draft — on Pro this wants
 * 300. A cut-off here surfaces as the stream simply stopping.
 */
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  // A single draft is generated per project (the old 1-of-3 variation flow is gone).
  const variation = 1;

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
        const { text } = await streamText({
          model: drafting,
          system: buildSystemLayers(ctx),
          task: draftTask({ outlineMarkdown: outline, longForm }),
          maxTokens,
          onDelta: (d) => send(controller, { t: "delta", d }),
          projectId: id,
          stage: "draft",
        });

        // Append a Sources section built from the outline's research sources, so
        // long-form drafts always cite where they were drafted from (rather than
        // relying on the writer to add one). Stream it as a final chunk too.
        let finalText = text;
        if (longForm) {
          const sources = extractOutlineSources(outline);
          const alreadyHasSection = /(^|\n)#{1,6}\s*(sources|references)\b/i.test(text);
          if (sources.length && !alreadyHasSection) {
            const block =
              "\n\n## Sources\n\n" +
              sources.map((s) => `- [${s.name}](${s.url})`).join("\n");
            send(controller, { t: "delta", d: block });
            finalText = text + block;
          }
        }

        // Strip em dashes from the saved article (belt-and-suspenders with the
        // system-prompt rule) so the persisted/exported copy reads human-written.
        finalText = deDash(finalText);

        // Keep one selected draft. Regeneration snapshots the previous version
        // before replacing its content so history remains restorable.
        const db = await getDb();
        const existing = loaded.drafts.find((draft) => draft.variationNo === variation);
        let row;
        if (existing) {
          if (existing.contentMd.trim()) {
            await db.insert(refinements).values({
              projectId: id,
              draftId: existing.id,
              userMessage: "Version before regeneration",
              resultMd: existing.contentMd,
            });
          }
          [row] = await db.update(drafts).set({ contentMd: finalText, isSelected: true }).where(eq(drafts.id, existing.id)).returning();
        } else {
          [row] = await db.insert(drafts).values({
            projectId: id,
            variationNo: variation,
            contentMd: finalText,
            isSelected: true,
          }).returning();
        }

        const metric = countMetrics(finalText);
        send(controller, {
          t: "done",
          draftId: row.id,
          metricLabel: metric.label,
          content: finalText,
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
