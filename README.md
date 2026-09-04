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
      images/[id]          serves stored images
      brand-image/[id]     serves the brand's uploaded logo/avatar
  db/                      Drizzle schema, dual PGlite/Postgres driver, seed
  lib/                     anthropic client, brand strategy, projects, image providers, …
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
