import "server-only";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

/**
 * Pipeline stages, keyed by which model tier they run on. Research runs on the
 * cheap/fast tier; every Sonnet stage (outline, draft, refine, imagePrompt)
 * runs on the drafting tier.
 *
 * Routing stays DB-configurable (Settings → Models writes `model.research` and
 * `model.drafting`) rather than a hardcoded const map — but this is the single
 * place that maps a Stage to a model, so no model string is chosen elsewhere.
 */
export type Stage = "research" | "outline" | "draft" | "refine" | "imagePrompt";

const RESEARCH_STAGES: ReadonlySet<Stage> = new Set<Stage>(["research"]);

const DEFAULTS = {
  research: "claude-haiku-4-5",
  drafting: "claude-sonnet-5",
} as const;

async function tiers(): Promise<{ research: string; drafting: string }> {
  const db = await getDb();
  const rows = await db.select().from(appSettings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    research: map["model.research"] ?? DEFAULTS.research,
    drafting: map["model.drafting"] ?? DEFAULTS.drafting,
  };
}

/** Resolve the model string for a stage from the DB-configured tiers. */
export async function modelFor(stage: Stage): Promise<string> {
  const { research, drafting } = await tiers();
  return RESEARCH_STAGES.has(stage) ? research : drafting;
}

export { tiers as resolveModelTiers };
