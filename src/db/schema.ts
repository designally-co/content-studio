import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uuid,
} from "drizzle-orm/pg-core";

/** Languages a project can target. "both" generates paired TH + EN versions. */
export type Language = "th" | "en" | "both";
export type ProjectStatus = "draft" | "published";
export type ApprovalOutcome = "approved_first" | "approved_edited" | "rejected";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /**
   * Null for anybody who signs in with Google, which is everybody today.
   * The column stays because password accounts return for outside testers;
   * see hashPassword in @/lib/auth.
   */
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrandDefaults = {
  cta?: string;
  links?: string;
  hashtags?: string;
};

export type LogoPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/*
 * VESTIGIAL. Generated images no longer carry a logo — the visual direction
 * asks for genuine editorial imagery, and a publisher's mark stamped into the
 * frame is the thing that made them read as marketing. The compositing code,
 * the per-image controls and the settings panel are gone.
 *
 * The type and the two columns below stay because dropping a column is a
 * destructive migration against a live database to reclaim nothing. They are
 * written by nobody and read by nobody. Delete them in a deliberate migration
 * if the schema is ever tidied.
 */

/** How the brand logo WAS overlaid onto a generated image. No longer applied. */
export type LogoOverlay = {
  position: LogoPosition;
  /** logo width as a percentage of the image width (1–60) */
  sizePct: number;
  /** 0–1 */
  opacity: number;
  /** subtle drop-shadow behind the logo for legibility */
  shadow: boolean;
};

export const DEFAULT_LOGO_OVERLAY: LogoOverlay = {
  position: "bottom-right",
  sizePct: 15,
  opacity: 1,
  shadow: true,
};

export const brandProfiles = pgTable("brand_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Legacy profile-image fields retained temporarily for migration fallback. */
  profileImageUrl: text("profile_image_url").notNull().default(""),
  profileImageData: text("profile_image_data").notNull().default(""),
  profileImageMime: text("profile_image_mime").notNull().default(""),
  /** The brand avatar, shown in Settings. Not applied to generated images. */
  logoData: text("logo_data").notNull().default(""),
  logoMime: text("logo_mime").notNull().default(""),
  /** Vestigial — see the note above LogoOverlay. Written by nobody. */
  logoOverlay: jsonb("logo_overlay_json")
    .$type<LogoOverlay>()
    .notNull()
    .default(DEFAULT_LOGO_OVERLAY),
  description: text("description").notNull().default(""),
  languages: jsonb("languages").$type<("th" | "en")[]>().notNull().default(["en"]),
  tone: jsonb("tone_json")
    .$type<{ descriptors: string[]; freeText: string }>()
    .notNull()
    .default({ descriptors: [], freeText: "" }),
  terminology: jsonb("terminology_json").$type<string[]>().notNull().default([]),
  dos: jsonb("dos_json").$type<string[]>().notNull().default([]),
  donts: jsonb("donts_json").$type<string[]>().notNull().default([]),
  audience: text("audience").notNull().default(""),
  defaults: jsonb("defaults_json").$type<BrandDefaults>().notNull().default({}),
  guidelineText: text("guideline_text").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Content Core Pillars — the four top-level editorial territories. */
export const pillars = pgTable("pillars", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable slug matching CONTENT_PILLARS in @/lib/content-pillars. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/**
 * Content directions — the selectable sub-categories under a pillar.
 * (Historically a flat "categories" list; now nested under a pillar.)
 */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameTh: text("name_th").notNull().default(""),
  pillarId: uuid("pillar_id").references(() => pillars.id),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export type FormatRules = {
  /** Authoritative generation instructions for the single article template. */
  prompt?: string;
  /** e.g. "800-1500 words" or "under 280 characters" */
  length: string;
  /** true for blog/newsletter; false = compact plan (hook/body/CTA) */
  longForm: boolean;
};

export type ProjectInputs = {
  articleMode?: import("@/lib/editorial").ArticleMode;
  editorialFormat?: import("@/lib/editorial").EditorialFormat;
  editorialPeriod?: string;
  editorialReader?: string;
  editorialEntryCount?: number;
  editorialCandidates?: import("@/lib/editorial").EditorialCandidate[];
  selectedEditorialCandidateIds?: string[];
  moment?: import("@/lib/designally-strategy").MomentOfChange;
  audienceSegment?: import("@/lib/designally-strategy").AudienceSegment;
  messagePillar?: import("@/lib/designally-strategy").MessagePillar;
  articleObjective?: import("@/lib/designally-strategy").ArticleObjective;
  keyword?: string;
  brief?: string;
  competitorUrl?: string;
  competitorSummary?: string;
  gscInsights?: string;
  extraGuidelines?: string;
  imageProvider?: string;
  imageCount?: number;
  imageAspectRatio?: string;
  /** Selected saved image-provider key; unset uses that provider's default/env key. */
  imageApiKeyId?: string;
  /**
   * Cached one-sentence dek (subtitle) shown in the Publish-stage Hub preview and
   * reused as the summary when publishing — generated once, not on every publish.
   */
  publishDek?: string;
  /**
   * Which generated image becomes the article's cover. Unset falls back to the
   * most recent one, which is what the stage did implicitly before the choice
   * existed — so an editor who never picks keeps the old behaviour.
   */
  coverImageId?: string;
};

export type SelectedTopic = {
  title: string;
  angle?: string;
  whyTimely?: string;
  searchIntent?: string;
  researchSources?: { name: string; url: string }[];
  source: "suggested" | "edited" | "custom" | "brief";
};

export type Outline = {
  /** markdown outline for long-form; compact plan fields for short-form */
  markdown: string;
  approved: boolean;
};

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The system is single-brand (Designally). The brand is a singleton loaded
  // via getBrand(); projects no longer carry a per-project brand reference.
  categoryId: uuid("category_id").references(() => categories.id),
  language: text("language").$type<Language>().notNull().default("en"),
  status: text("status").$type<ProjectStatus>().notNull().default("draft"),
  stage: integer("stage").notNull().default(1),
  inputs: jsonb("inputs_json").$type<ProjectInputs>().notNull().default({}),
  topicSuggestions: jsonb("topic_suggestions_json")
    .$type<SelectedTopic[]>()
    .default([]),
  selectedTopic: jsonb("selected_topic_json").$type<SelectedTopic | null>(),
  outline: jsonb("outline_json").$type<Outline | null>(),
  approvalOutcome: text("approval_outcome").$type<ApprovalOutcome | null>(),
  publishedTo: jsonb("published_to_json").$type<Record<string, string>>(), // reserved for Phase 2
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variationNo: integer("variation_no").notNull(),
  contentMd: text("content_md").notNull(),
  isSelected: boolean("is_selected").notNull().default(false),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refinements = pgTable("refinements", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  resultMd: text("result_md").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  width: integer("width"),
  height: integer("height"),
  variationNo: integer("variation_no").notNull().default(1),
  referenceIds: jsonb("reference_ids_json").$type<string[]>().notNull().default([]),
  storagePath: text("storage_path").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  /** Article image-slot index this image fills (null = standalone/companion). */
  position: integer("position"),
  /** Vestigial — see the note above LogoOverlay. Always null on new rows. */
  branding: jsonb("branding_json").$type<LogoOverlay | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A schedule that writes and publishes an article without an editor.
 *
 * See migration 0020 for why the schedule and its runs are separate tables.
 */
export type RoutineHubStatus = "draft" | "published";

export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Autopilot"),
  /** Off. An automation that publishes to a live site does not arrive switched on. */
  enabled: boolean("enabled").notNull().default(false),
  /** Null rotates through every active direction rather than repeating one. */
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  /**
   * What the article becomes in the Hub. `draft` keeps a human gate at the far
   * end even when everything before it is automatic.
   */
  hubStatus: text("hub_status").$type<RoutineHubStatus>().notNull().default("draft"),
  imagesPerRun: integer("images_per_run").notNull().default(1),
  /** A ceiling a bug cannot spend past. */
  maxPerDay: integer("max_per_day").notNull().default(1),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Where a run has got to.
 *
 * A full article takes minutes and a serverless function gets 60 seconds, so
 * the position lives in the database and one request advances one step.
 */
export type RoutineStep = "topic" | "plan" | "draft" | "images" | "publish" | "done";
export type RoutineRunStatus = "running" | "done" | "failed";

export const routineRuns = pgTable("routine_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  routineId: uuid("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  /**
   * Set null rather than cascade: deleting the article should not erase the
   * record that the machine made one.
   */
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  step: text("step").$type<RoutineStep>().notNull().default("topic"),
  status: text("status").$type<RoutineRunStatus>().notNull().default("running"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  /** Concurrency guard — see migration 0020. */
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Where a reference image came from.
 *
 * `article_source` is the lead image of a page the article already cites, and
 * carries no licence — it is the publisher's own work, shown to the editor as
 * something to decide about rather than something cleared.
 * `open_license` came from an open-licence pool and carries its licence and
 * attribution with it.
 */
export type ReferenceOrigin = "upload" | "article_source" | "open_license";

/** Source images that may guide one or more image generations. */
export const imageReferences = pgTable("image_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  originalName: text("original_name").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** How this reference arrived. See migration 0019. */
  origin: text("origin").$type<ReferenceOrigin>().notNull().default("upload"),
  /** The page it was taken from — never the image file, so a person can check it. */
  sourceUrl: text("source_url"),
  /** Publisher, or the creator the licence names. */
  sourceName: text("source_name"),
  /**
   * Null means nobody has cleared this image. That is the honest state for a
   * publisher's own photograph, and it is deliberately visible rather than
   * assumed away.
   */
  license: text("license"),
  attribution: text("attribution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiUsageLog = pgTable("api_usage_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  stage: text("stage").notNull(),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  /** Cache-write tokens (~1.25x rate) and cache-read tokens (~0.1x rate). */
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  /** Prompt revision (PROMPT_VERSION) this call ran under; correlates prompt edits to outcomes. */
  promptVersion: text("prompt_version"),
  latencyMs: integer("latency_ms"),
  /** How many times structured-output validation retried before succeeding (0 = first try). */
  schemaRetryCount: integer("schema_retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PricingUnit = "mtok_in" | "mtok_out" | "image";

export const pricing = pgTable("pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  unit: text("unit").$type<PricingUnit>().notNull(),
  priceUsd: numeric("price_usd", { precision: 12, scale: 6 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** App-level settings stored as key/value (e.g. selected drafting model). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * User-supplied API keys, encrypted at rest (see src/lib/crypto.ts). Multiple
 * Fal.ai keys can be saved for image generation. Anthropic is environment-only.
 * generation time. If a provider has no saved rows, its env var is used
 * instead — see src/lib/secrets.ts.
 */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
