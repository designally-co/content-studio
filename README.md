# Designally Content Studio

An internal, AI-powered content generation web app for the Designally team. It
turns a topic into publish-ready blog posts and social content — in Thai and
English — through a guided 6-stage pipeline, with per-article cost transparency
at every step.

> All output is reviewed by a human before publishing. The tool's job is to make
> that first draft good enough that approval is fast. The app tracks the
> **first-draft approval rate** so that quality is measurable from day one.

## Features (MVP)

- **Auth** — email/password for the internal team (custom credentials, portable
  to self-hosting). A `role` field is in place for future role-based access.
- **Single brand profile** — one brand (Designally) for the whole system:
  tone, terminology, do/don't rules, audience, defaults, a logo/avatar image,
  and pasted brand guidelines that steer every generation. Edited in
  **Settings → Brand**; automatically applied to every project (no per-project
  brand selection).
- **Article template & categories** — article generation instructions and
  categories are editable in Settings. New categories can also be **added on the fly** (with search)
  while creating content, and are saved for reuse.
- **Guided 6-stage pipeline** — Setup → Topics → Outline → Drafts (3 streamed
  variations) → Refine (chat) → Finalize (copy, images, cost, approval).
- **Trend/topic suggestions** via the Anthropic web search tool.
- **Competitor URL** fetch & summarize (as reference — never copies).
- **Search Console CSV** parsing into prompt insights.
- **3-variation streamed drafts**, Thai & English (Thai-quality prompting).
- **Chat-based refinement** on the chosen draft.
- **Companion image generation** with a model picker powered by Fal.ai.
- **Focused API key management** — add provider-specific image keys in Settings. Text
  generation uses the server's Anthropic environment key; image generation uses Fal.ai.
- **Token & cost tracking** — per generation, per project (by stage), and a
  dashboard with approval rate, monthly spend, and total spend.
- **Copy-to-clipboard** export (Markdown + plain text).
- **Content Library** with filters and reopen.

## Tech stack

- **Next.js** (App Router, TypeScript) — server actions + route handlers for all
  AI calls. The Anthropic key stays server-side.
- **Drizzle ORM** over **Postgres**. Runs on **Supabase** in production, or on an
  embedded **PGlite** database locally (zero external services).
- **Tailwind CSS v4** — light, minimal dashboard theme; IBM Plex Sans / Plex Sans
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

## Model & pricing configuration

Models and the pricing table are seeded on first boot and editable in
**Settings**:

- **Research model** (trends, competitor summary): a fast model — default
  `claude-haiku-4-5`.
- **Drafting model** (outline, drafts, refine): a high-quality model — default
  `claude-sonnet-5`.
- **Pricing table** — per-model input/output $/MTok and per-image prices. Edit
  these when prices change; all cost figures derive from this table.

> Confirm current Anthropic model IDs and pricing at deploy time — the seeded
> values are indicative (July 2026) and adjustable in the UI.

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

3. **Apply the schema.** The app runs migrations automatically on boot, so
   normally there is nothing to do. To apply manually instead, either:

   - run `npm run db:migrate` against `DATABASE_URL`, or
   - paste `drizzle/0000_init.sql` into the Supabase SQL editor and run it.

4. **(Optional) Image storage.** Create a **public** Storage bucket named
   `content-studio-images` (or your `SUPABASE_STORAGE_BUCKET`). Without Supabase
   Storage configured, generated images are written to `./data/images` and
   served by the app.

The app uses the standard Node runtime and Supabase only — no Vercel-exclusive
features (Edge-only APIs, KV, Blob) — so it runs unchanged on Vercel now and on a
self-hosted server later.

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
      page.tsx             Dashboard
      new/                 Stage 1 — Setup
      pipeline/[id]/       Stages 2–6 (stepper + stage components)
      library/             Content Library (filterable)
      settings/            Brand, categories, article template, models, pricing, providers
    api/
      pipeline/[id]/draft  streamed draft generation (NDJSON)
      pipeline/[id]/refine streamed refinement (NDJSON)
      images/[id]          serves stored images
      brand-image/[id]     serves the brand's uploaded logo/avatar
  db/                      Drizzle schema, dual PGlite/Postgres driver, seed
  lib/                     anthropic client, cost, projects, image providers, …
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
