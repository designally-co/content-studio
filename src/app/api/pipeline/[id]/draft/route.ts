import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateDraftCore } from "@/lib/pipeline/draft";
import { countMetrics } from "@/lib/text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * Streaming a whole article is the longest thing this app does: up to 8,000
 * tokens, or 12,000 for a paired TH+EN draft. 60 is the most every Vercel plan
 * allows and is probably still short for a long-form draft — on Pro this wants
 * 300. A cut-off here surfaces as the stream simply stopping.
 */
export const maxDuration = 60;

/**
 * The streaming half of drafting. The writing itself lives in
 * `@/lib/pipeline/draft` so the autopilot runner can do the same work without a
 * session and without a stream; this route supplies the session, the NDJSON
 * envelope, and the deltas an editor watches arrive.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { draftId, content } = await generateDraftCore(id, (d) =>
          send(controller, { t: "delta", d })
        );
        send(controller, {
          t: "done",
          draftId,
          metricLabel: countMetrics(content).label,
          content,
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
