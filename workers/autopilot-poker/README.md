# autopilot-poker

Calls `POST /api/cron/autopilot` on Content Studio every two minutes, so
routines start when they are due and finish without anyone watching.

## Why it is needed

One poke advances a run by **one step** (occasionally two, when a fast step
leaves room in the budget). The runner keeps its budget under Vercel's
60-second function cap and stops cleanly rather than being cut off mid-step, so
a five-to-seven step article needs five to seven pokes. Without a timer, a
routine starts at 9:00 and then waits — which is why an article used to appear
only once somebody opened the app, since an open tab steps a run too.

**The interval is the article's pace.** Each step's own work is well under a
minute, so a run spends nearly all its wall-clock waiting for the next poke.
Measured unattended on 9 September 2026: seven steps in 25 minutes at `*/5`,
which is why the schedule is now `*/2` and the same article takes about 12.
Faster than that adds pokes that find the run claimed, without the article
arriving sooner.

## Deploy

Two secrets, then ship it:

```bash
cd workers/autopilot-poker
wrangler login
wrangler deploy                        # creates the Worker
wrangler secret put AUTOPILOT_URL      # https://<your-app>/api/cron/autopilot
wrangler secret put AUTOPILOT_SECRET   # same value as CRON_SECRET in Vercel
```

`AUTOPILOT_SECRET` must be the **production** `CRON_SECRET` read from the Vercel
dashboard. The CLI prints `[SENSITIVE]` for it, and the value in a local
`.env.local` is a different one — a mismatch shows up only as `HTTP 401` in
`wrangler tail`, hours later, looking like a scheduler that never fired.

Deploy first so the Worker exists before secrets are attached to it, and run
all of it from this folder — wrangler reads `wrangler.toml` from the directory
you are standing in, which is where the name comes from.

`workers_dev = false` is why it never asks to register a `*.workers.dev`
subdomain: this Worker serves no HTTP routes, so it needs no hostname.

**If the account has never had a workers.dev subdomain, the first deploy fails
with error 10063 — and it fails AFTER uploading the script.** So the Worker
appears in the dashboard while the cron trigger silently does not, which looks
like a Worker that deployed fine and never runs. Register the subdomain once,
under Workers & Pages → your account → Subdomain, then run `wrangler deploy`
again; the second run attaches the trigger. Confirm it either from the deploy's
own output, which ends with the schedule:

```
Deployed autopilot-poker triggers
  schedule: */2 * * * *
```

or in the dashboard under the Worker's Settings → Trigger events, where "No
cron triggers configured" means it did not take.

`wrangler tail` shows each poke's reply. A quiet one looks like:

```
autopilot → {"ok":true,"started":0,"advanced":[],"idle":true,"note":"Nothing is due yet."}
```

## Checking it

The endpoint answers the same thing to anyone holding the secret, so a poke by
hand is the quickest test:

```bash
curl -s -X POST https://<your-app>/api/cron/autopilot \
  -H "authorization: Bearer $CRON_SECRET"
```

`idle: true` means nothing was due — that is the normal reply most of the day.
`started: 1` means a routine has just begun. `advanced: [...]` names the steps
that moved. A healthy unattended run reads, across consecutive pokes:

```
started:1
plan → draft
draft → prompt
prompt → reference
reference → images → publish
publish → done
```

A routine that came due and was deliberately passed over writes a `skipped` row
instead, with its reason, shown on the routine's card. Silence on a card whose
time has passed means the poke never arrived — check `wrangler tail` before
suspecting the app.

## What else is on a timer

`vercel.json` keeps a once-a-day cron on the same endpoint as a backstop, in
case this Worker is ever stopped or its secrets go stale. Hitting an idempotent
endpoint twice costs a database query, so the overlap is harmless.
