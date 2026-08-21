import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
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
import { articleMaxTokens } from "@/lib/generation-limits";
import { deDash } from "@/lib/text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** A refinement returns the COMPLETE draft each turn, so it is as long-running
 *  as the draft itself. See the note in the draft route. */
export const maxDuration = 60;

const REFINE_FRAME =
  "You are iteratively refining a Markdown draft. Each of my messages is a change to apply. Reply each time with the COMPLETE updated Markdown draft, preserving everything I did not ask to change — not a diff, not a description of changes, no preamble.";

const change = (instruction: string) => `Change to apply: ${instruction}`;

/** How many prior refinement turns to replay (keeps within the cache lookback). */
const MAX_HISTORY = 8;

/**
 * Rebuild the refine turn as a conversation: prior instructions and the full
 * drafts they produced are replayed as user/assistant turns, with a cache
 * breakpoint on the latest draft. Prompt caching then serves the (large) prior
 * drafts at ~0.1x instead of re-billing the whole article on every refine — so
 * each turn pays full price only for the new instruction and the new draft.
 */
function buildRefineMessages(
  history: { userMessage: string; resultMd: string }[],
  baseDraft: string,
  newMessage: string
): Anthropic.MessageParam[] {
  const recent = history
    .filter((entry) => !entry.userMessage.startsWith("Version "))
    .slice(-MAX_HISTORY);

  if (recent.length === 0) {
    // First refine: show the base draft once (system prompt is already cached).
    return [
      {
        role: "user",
        content: `${REFINE_FRAME}\n\nHere is the current draft:\n\n${baseDraft}\n\n${change(newMessage)}`,
      },
    ];
  }

  const messages: Anthropic.MessageParam[] = [];
  recent.forEach((r, i) => {
    messages.push({
      role: "user",
      content: i === 0 ? `${REFINE_FRAME}\n\n${change(r.userMessage)}` : change(r.userMessage),
    });
    const isLast = i === recent.length - 1;
    messages.push({
      role: "assistant",
      content: isLast
        ? [{ type: "text", text: r.resultMd, cache_control: { type: "ephemeral" } }]
        : r.resultMd,
    });
  });
  messages.push({ role: "user", content: change(newMessage) });
  return messages;
}

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
  const maxTokens = longForm ? articleMaxTokens(loaded.articleRules.length, ctx.language) : ctx.language === "both" ? 4000 : 3000;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { text } = await streamText({
          model: drafting,
          system: buildSystemLayers(ctx),
          messages: buildRefineMessages(loaded.refinements, selected.contentMd, message),
          maxTokens,
          onDelta: (d) => send(controller, { t: "delta", d }),
          projectId: id,
          stage: "refine",
        });

        // Strip em dashes from the revised article so the saved copy stays
        // human-reading (mirrors the draft route + the system-prompt rule).
        const cleaned = deDash(text);

        const db = await getDb();
        await db.insert(refinements).values([
          {
            projectId: id,
            draftId: selected.id,
            userMessage: `Version before AI revision: ${message}`,
            resultMd: selected.contentMd,
          },
          {
            projectId: id,
            draftId: selected.id,
            userMessage: message,
            resultMd: cleaned,
          },
        ]);
        await db
          .update(drafts)
          .set({ contentMd: cleaned })
          .where(eq(drafts.id, selected.id));

        send(controller, { t: "done", content: cleaned });
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
