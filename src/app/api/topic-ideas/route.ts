import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateTopicIdeas } from "@/lib/pipeline/topics";
import type { Language } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** The ideas call allows itself 35s, and a truncation heal can double that. */
export const maxDuration = 60;

/**
 * Ideas over a stream, not a Server Action.
 *
 * "LOAD FAILED" ON A PHONE. The action version answered nothing for the whole
 * 20–35 seconds the model took, and on a mobile connection a request that
 * carries no bytes for that long is the one a carrier NAT or Safari gives up
 * on — WebKit reports it as `TypeError: Load failed`, with no status and
 * nothing in the function log, because the function was still running when
 * the phone stopped listening. The draft route never had this problem because
 * it streams from the first token.
 *
 * So this does the same: a heartbeat frame every few seconds while the model
 * works, then one `done` frame with the ideas. The bytes are the point — the
 * connection stays live because something is always arriving on it. It also
 * carries a real error message home: a Server Action masks its errors in
 * production, and "an error occurred" told nobody anything.
 */
const HEARTBEAT_MS = 4_000;

type Body = { categoryId?: string; pillarSlug?: string; language?: Language };

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const heartbeat = setInterval(() => send({ t: "tick" }), HEARTBEAT_MS);
      try {
        // The first byte goes out before any work, so the connection is
        // established as a streaming one rather than a pending one.
        send({ t: "start" });
        const topics = await generateTopicIdeas({
          categoryId: body.categoryId || undefined,
          pillarSlug: body.pillarSlug || undefined,
          language: body.language ?? "en",
        });
        send({ t: "done", topics });
      } catch (err) {
        send({ t: "error", m: err instanceof Error ? err.message : "Could not generate topic ideas." });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
