import { tick } from "@/lib/autopilot/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * The same sixty seconds everything else on this app gets. The runner keeps its
 * own budget below this and stops cleanly rather than being cut off mid-step.
 */
export const maxDuration = 60;

/**
 * The autopilot's heartbeat. Something external calls this; it advances the work
 * that is in flight and starts a run when one is due.
 *
 * AUTHENTICATION IS NOT OPTIONAL HERE. Every other write in this app is behind
 * a Google session, and this one is not — it is reached by a scheduler with no
 * cookie. Left open it would be a button on the internet that spends Anthropic
 * and Fal credit and publishes to a live site, so it demands a shared secret
 * and refuses to run at all without one configured. A missing `CRON_SECRET` is
 * a 503, deliberately: failing closed on a misconfiguration is the only safe
 * default for an endpoint like this.
 *
 * The comparison is length-checked and constant-time-ish via `timingSafeEqual`.
 * That is probably more care than a secret of this value needs, but the cost is
 * four lines.
 *
 * WHY AN EXTERNAL POKE. Vercel's own cron on the Hobby plan fires roughly once
 * a day, and one article needs five steps. A schedule that granular would take
 * most of a week to finish one. Anything that can make an HTTPS request on a
 * timer works instead — the repository ships a GitHub Actions workflow that
 * does it every ten minutes, which is free and needs no plan change. The
 * endpoint is idempotent: a poke with nothing to do returns `idle` and costs
 * one database query.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not set. The autopilot endpoint stays closed without it." },
      { status: 503 }
    );
  }

  const offered = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const report = await tick();
    return Response.json({ ok: true, ...report });
  } catch (cause) {
    // A failure inside a step is recorded on the run and is not an error here.
    // Reaching this means the runner itself could not run — a database that is
    // down, a schema behind the code — and the scheduler should see a 500 so
    // the failure is visible in its own logs rather than only in ours.
    return Response.json(
      { ok: false, error: cause instanceof Error ? cause.message : "Autopilot failed." },
      { status: 500 }
    );
  }
}

/**
 * Vercel Cron issues GET, and some schedulers only do GET. Same work, same
 * secret — the method is not the security boundary.
 */
export async function GET(req: Request) {
  return POST(req);
}
