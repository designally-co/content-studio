# Designally Content Studio

An internal, AI-powered content generation web app for the Designally team. It
turns a topic, brief, or creative category into a publish-ready article
for Designally’s article platform, in Thai and English.

## Features (MVP)

- **Auth** — email/password for the internal team (custom credentials, portable
  to self-hosting). A `role` field is in place for future role-based access.
- **Single brand profile** — one brand (Designally) for the whole system:
  tone, terminology, do/don't rules, audience, defaults, a logo/avatar image,
  and a structured brand strategy that steers every generation. Edited in
  **Settings → Brand**; automatically applied to every project (no per-project
  brand selection).
- **Article template & categories** — article generation instructions and
  creative-agency categories are editable in Settings. The default territory
  covers resources, fonts, UX/UI, design principles, AI tools for designers,
  branding, web design, and creative-industry developments. New categories can also be **added on the fly** (with search)
  while creating content, and are saved for reuse.
- **One focused workflow** — Create → Draft & edit → Generate images → Done.
- **Three ways to start** — provide a topic, provide a brief, or choose a category
  and let AI generate timely topic ideas.
- **Research-backed drafting** — candidate research, source verification, and
  article planning run automatically behind the single Generate draft action.
- **Trend/topic suggestions** via the Anthropic web search tool.
- **Lightweight source research** — one current-source article plan runs before drafting, without a candidate-selection pipeline.
- **One streamed article draft** built from the verified source plan.
- **Chat-based refinement** on the chosen draft.
- **Companion image generation** with a model picker powered by Fal.ai.
- **Focused API key management** — add provider-specific image keys in Settings. Text
  generation uses the server's Anthropic environment key; image generation uses Fal.ai.
- **Editorial fact-check** — source consistency and factual review without performance scores.
- **Copy-to-clipboard** export (Markdown + plain text).
- **Content Library** with filters and reopen.
- **Routines** — as many saved schedules as you like, each writing an article on
  its own: it picks the direction, researches, drafts, generates the cover
  image, and sends the result to the Knowledge Hub with nobody reviewing it on
  the way. Built and run from the **Routines** tab — daily, weekdays, weekly or
  by hand — capped per day, with every run listed under the routine that made it.

## Tech stack

- **Next.js** (App Router, TypeScript) — server actions + route handlers for all
  AI calls. The Anthropic key stays server-side.
- **Drizzle ORM** over **Postgres**. Runs on **Supabase** in production, or on an
  embedded **PGlite** database locally (zero external services).
- **Tailwind CSS v4** — light, focused product theme; IBM Plex Sans / Plex Sans
  Thai / Plex Mono for a clear hierarchy and correct Thai rendering.
- **Anthropic Messages API** — streaming drafts, web search for trends. Models
  are configurable in Settings (a fast model for research, a high-quality model
  for drafting).

## Quick start (local, no external services)

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local
# Optionally set ANTHROPIC_API_KEY in .env.local to enable generation.
npm run dev
```

Open http://localhost:3000. On first run you'll create the initial team account.
With no `DATABASE_URL`, the app uses an embedded PGlite database in `./data` and
applies the schema automatically — nothing else to configure.

Generation stages need `ANTHROPIC_API_KEY` in the server environment; without one, the app still runs and
shows a clear "not configured" state at each generation step.

## API key management

Settings provides one flat API-key list. Users select a provider and add its
key; Fal.ai is an ordinary removable user-added entry. Anthropic credentials
are not shown or managed in the application.

- **Text:** Anthropic (research, trends, outlines, drafts, and refinement).
- **Images:** Fal.ai.

Text generation uses `ANTHROPIC_API_KEY`. There is no project-level text-key
selector. Image models use the selected saved key and disappear from generation
when that provider key is deleted. Raw values are resolved only on the server
and are never shown again after saving.

Saved keys use AES-256-GCM encryption. Local development generates a stable
encryption key under `./data`; production must set a stable `ENCRYPTION_KEY`.

## Model configuration

Generation models are seeded on first boot and selectable in **Settings**:

- **Research model** (trends, competitor summary): a fast model — default
  `claude-haiku-4-5`.
- **Drafting model** (outline, drafts, refine): a high-quality model — default
  `claude-sonnet-5`.
Legacy pricing data remains in the schema for compatibility but is not shown or
used for usage logging.

## Production with Supabase

1. **Create a Supabase project.** Copy the **pooled** connection string
   (Project → Database → Connection string → *Transaction pooler*, port 6543).

2. **Set environment variables** (see `.env.example`):

   ```bash
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   AUTH_SECRET=$(openssl rand -hex 32)
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   ANTHROPIC_API_KEY=sk-ant-...
   # optional image storage in Supabase (else images are stored on disk)
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_STORAGE_BUCKET=content-studio-images
   ```

3. **Apply the schema.** On Vercel this happens for you: the `vercel-build`
   script runs `next build` and then applies migrations, so a production deploy
   always brings the database with it. **Production only** — preview builds skip
   it, because a preview is built from an unmerged branch and usually points at
   the same database. `DATABASE_URL` must be exposed to the Production
   environment at *build* time, or the build fails rather than deploying code
   that expects columns the database does not have.

   Anywhere else — Docker, a plain Node server, a manual fix — apply them
   yourself:

   - run `npm run db:migrate` against `DATABASE_URL`, or
   - paste the files in `drizzle/` into the Supabase SQL editor and run them.

   Do not rely on the app applying them at boot. Deployed environments set
   `SKIP_DB_MIGRATE=1` (see §10 of `INTEGRATION.md` for why), and with it set
   nothing migrates on boot at all. `GET /api/health` reports `schema`, which
   names any migration the database is missing and returns 503 while it is
   behind — check it after a deploy that changed the schema.

4. **(Optional) Image storage.** Create a **public** Storage bucket named
   `content-studio-images` (or your `SUPABASE_STORAGE_BUCKET`). Without Supabase
   Storage configured, generated images are written to `./data/images` and
   served by the app.

The app uses the standard Node runtime and Supabase only — no Vercel-exclusive
features (Edge-only APIs, KV, Blob) — so it runs unchanged on Vercel now and on a
self-hosted server later.

### Staging deployments

The private GitHub repository is connected to the dedicated Vercel staging
project. Pushing to `main` automatically updates the stable staging deployment;
other branches and pull requests receive isolated preview deployments.

## Routines (unattended publishing)

A routine writes one article end to end and sends it to the Knowledge Hub with
no human in the loop. Routines live in the **Routines** tab: name, content
direction (or rotate through all of them), when it runs, and whether the
finished article is saved as a Hub draft or published live without a check. Every
routine also has **Run now**, which starts one immediately and drives it to the
end while the page is open — one request per step, so a manual run finishes in a
few minutes instead of waiting for the schedule.

**Everything about WHEN lives in the app.** The external timer knows nothing: it
calls `/api/cron/autopilot` on a fixed interval and the app decides which
routines are due. Two things have to be set once for that to happen:

1. `CRON_SECRET` in the deployment environment (`openssl rand -hex 32`). The
   endpoint refuses to run without it — a 503, deliberately.
2. Two GitHub repository secrets so the shipped workflow can call it every five
   minutes: `AUTOPILOT_URL` (`https://<your-app>/api/cron/autopilot`) and
   `AUTOPILOT_SECRET` (the same value as `CRON_SECRET`). Without them the
   workflow exits quietly instead of failing.

Nothing else is configured outside the app. Changing a routine's day, hour or
time zone never means editing the workflow.

**Why a poke and not one long job.** A full article is seven model-and-provider
steps taking three to four minutes; a serverless function gets sixty seconds. So
a run is a state machine whose position lives in `routine_runs`, advanced a step
at a time by whatever calls the endpoint. A crashed run resumes where it stopped
rather than being lost, and two schedulers arriving together cannot advance the
same run twice (`FOR UPDATE SKIP LOCKED` plus a claim that expires).

One poke does one step, because steps are not the same size — a topic takes ten
seconds and a draft can take fifty — and starting a second one with half the
budget left is what a 504 looks like from the outside. At a poke every five
minutes an article lands about half an hour after it starts.

The cover is three of those seven steps — write the prompt, find the photograph
and rewrite the prompt against it, generate — because doing all four remote
calls in one step took 46 seconds and was killed every time.

`vercel.json` also calls the endpoint daily as a backstop. That is a safety net,
not the schedule — Vercel's Hobby cron fires about once a day, which would take
most of a week to finish one article.

**Every path through a routine.** Written down because the interesting cases are
the ones nobody demonstrates.

*Making one.* Routines → New routine → name it, choose when it runs, choose a
direction (or let it rotate), choose whether it saves a draft or publishes live
→ Create. The sentence under the form says what the schedule means and when the
first run lands, before it is saved. A routine set to "only when I press Run
now" has no switch at all: there is no schedule for it to be on for.

*Running one by hand.* Run now, on the row. The article starts immediately and
the page drives it — seven steps, one request each, about three minutes, with
the step named as it happens. It ignores the one-a-day ceiling, because that
ceiling exists to stop a schedule spending all day and a person pressing a
button is not a schedule. When it finishes, the row links to what it wrote.

*Running on a schedule.* Every five minutes the app is asked whether anything is
due. A routine whose time has passed starts one article, then its clock moves to
the next occurrence — from now, not from the run it missed, so a routine switched
back on after a week writes one article rather than seven. It is skipped, quietly
and without losing its place, when today's ceiling is used, when too many starts
have already failed today, or when it publishes live and the Hub is not
configured.

*Watching one.* The page shows any run in flight, including one it did not
start, picks up driving it, and updates while it goes. Closing the page does not
stop the run: it advances one step every five minutes instead of as fast as the
steps finish. Opening the page again picks it back up.

*When a step fails.* It is retried twice. After the third failure the run stops
and the error stands in the routine's history in plain words — a rejected key
says so and names the variable. Nothing else is attempted, and the next
scheduled run starts a fresh article rather than resuming a dead one.

*Changing one.* Details → Edit settings. Saving recomputes the next run from the
new schedule. Switching a routine off clears it; switching it back on sets it
again from that moment.

*Deleting one.* Details → Delete → Delete for good. The schedule and its run
history go. **The articles it wrote stay in the Library**, published ones
included; nothing on the Hub is touched.

**The brakes.** A routine produces exactly one article, with one cover image, per
run, and at most one a day on a schedule — neither is a setting, because a run
that quietly produced two articles is a run nobody asked for, and the second
image was only ever a variation for an editor to choose between. Pressing Run
now is an explicit instruction and is not subject to the daily ceiling. A
step that fails is retried twice and then the run stops with the error visible in
the history — and a step is counted as attempted the moment it is picked up, not
when it fails, so one killed by the platform (a 504, which runs none of our code)
still counts and cannot retry forever. Five failed *starts* in a day and it stops trying until tomorrow.
Leaving "What it creates in the Hub" on **draft** keeps one human gate at the far
end while everything before it stays automatic — the safer of the two by a wide
margin.

## Docker / self-hosting

A `Dockerfile` and `docker-compose.yml` are provided from day one.

```bash
# with a .env file next to docker-compose.yml (see .env.example)
docker compose up --build
```

The image builds the Next.js standalone output and runs `node server.js`. The
`content_studio_data` volume persists local fallbacks (PGlite data, the dev auth
secret, and on-disk images) across restarts; when `DATABASE_URL` and Supabase
Storage are set, those local fallbacks are not used.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (standalone output) |
| `npm start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Project structure

```
src/
  app/
    login/                 first-run account + sign in
    (app)/                 authenticated shell (left nav)
      page.tsx             Content Library home
      new/                 Stage 1 — Setup
      pipeline/[id]/       Stages 2–6 (stepper + stage components)
      library/             Content Library (filterable)
      settings/            Brand strategy, categories, article template, models, providers
    api/
      pipeline/[id]/draft  streamed draft generation (NDJSON)
      pipeline/[id]/refine streamed refinement (NDJSON)
      cron/autopilot       the autopilot's heartbeat (shared-secret, no session)
      images/[id]          serves stored images
      brand-image/[id]     serves the brand's uploaded logo/avatar
  db/                      Drizzle schema, dual PGlite/Postgres driver, seed
  lib/
    pipeline/              each pipeline step as a plain function, session-free
    autopilot/             the unattended runner that calls those functions
    …                      anthropic client, brand strategy, projects, image providers
  prompts/                 layered, versioned prompt templates
```

## Prompt architecture

Prompts are assembled in layers (system → brand → format → context → task) and
live in versioned files under `src/prompts/`, so they can be tuned without
touching call sites. Structured stages (topics, outline) request JSON and parse
defensively with a one-shot retry.

## Data model & Phase 2

The schema (`src/db/schema.ts`) reserves `role` on users and `published_to` on
projects, while categories remain data-driven. This leaves room for role-based
access and direct publishing (WordPress or social APIs) without complicating
the current article-only workflow. See the product concept document for the
full Phase 2 list.
