# autopilot-poker

Calls `POST /api/cron/autopilot` on Content Studio every five minutes, so
routines start when they are due and finish without anyone watching.

## Why it is needed

One poke advances a run by **one step**. The runner keeps its budget under
Vercel's 60-second function cap and stops cleanly rather than being cut off
mid-step, so a five-to-seven step article needs five to seven pokes. Without a
timer, a routine starts at 9:00 and then waits — which is why an article used
to appear only once somebody opened the app, since an open tab steps a run too.

## Deploy

Two secrets, then ship it:

```bash
cd workers/autopilot-poker
wrangler secret put AUTOPILOT_URL      # https://<your-app>/api/cron/autopilot
wrangler secret put AUTOPILOT_SECRET   # same value as CRON_SECRET in Vercel
wrangler deploy
```

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
that moved.

## What else is on a timer

`vercel.json` keeps a once-a-day cron on the same endpoint as a backstop, in
case this Worker is ever stopped or its secrets go stale. Hitting an idempotent
endpoint twice costs a database query, so the overlap is harmless.
