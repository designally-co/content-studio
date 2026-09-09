/**
 * Ask the app whether any routine has work, every five minutes.
 *
 * NO LOOP IN HERE. The GitHub workflow this replaces polled twelve times at
 * five-minute intervals once it found work, because it only ran a few times a
 * day and had to finish an article in one sitting. A trigger that actually
 * fires every five minutes is already that cadence, so one poke per trigger is
 * the whole job — and there is no long-running worker to reason about.
 *
 * The endpoint is idempotent and decides everything itself: what is due, what
 * is in flight, and what to do next. This knows nothing except the URL.
 */
export interface Env {
  /** https://<your-app>/api/cron/autopilot */
  AUTOPILOT_URL: string;
  /** The same value as CRON_SECRET in the Vercel environment. */
  AUTOPILOT_SECRET: string;
}

type Ctx = { waitUntil(promise: Promise<unknown>): void };

const worker = {
  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    if (!env.AUTOPILOT_URL || !env.AUTOPILOT_SECRET) {
      console.error("AUTOPILOT_URL or AUTOPILOT_SECRET is not set — nothing to poke.");
      return;
    }

    /* Held open with waitUntil rather than left to chance: a step can take most
       of a minute, and the reply is the only place the outcome is visible. Read
       it with `wrangler tail`. */
    ctx.waitUntil(
      (async () => {
        try {
          const response = await fetch(env.AUTOPILOT_URL, {
            method: "POST",
            headers: { authorization: `Bearer ${env.AUTOPILOT_SECRET}` },
          });
          const body = await response.text();
          /* A failure is logged, not retried. The next trigger is five minutes
             away and the endpoint is idempotent, so retrying here would only
             risk two pokes overlapping inside one step's budget. */
          if (!response.ok) {
            console.error(`autopilot → HTTP ${response.status} ${body.slice(0, 300)}`);
            return;
          }
          console.log(`autopilot → ${body.slice(0, 300)}`);
        } catch (cause) {
          console.error("autopilot → request failed", cause);
        }
      })()
    );
  },
};

export default worker;
