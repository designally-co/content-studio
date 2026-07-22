import { categories, pillars, pricing, appSettings } from "./schema";
import { CONTENT_PILLARS } from "@/lib/content-pillars";
import type { DB } from "./index";

/**
 * Seeds reference data on first boot (pillars + content directions, pricing,
 * default model settings). Idempotent: runs only when the target table is empty.
 * Prices are indicative at build time (July 2026) and editable in Settings.
 */
export async function seedIfEmpty(db: DB) {
  const existingPillars = await db.select().from(pillars).limit(1);
  if (existingPillars.length === 0) {
    const insertedPillars = await db
      .insert(pillars)
      .values(
        CONTENT_PILLARS.map((pillar) => ({
          slug: pillar.slug,
          name: pillar.name,
          tagline: pillar.tagline,
          purpose: pillar.purpose,
          sortOrder: pillar.order,
        }))
      )
      .returning();

    const pillarIdBySlug = new Map(insertedPillars.map((p) => [p.slug, p.id]));
    const directions = CONTENT_PILLARS.flatMap((pillar) =>
      pillar.directions.map((name, index) => ({
        name,
        pillarId: pillarIdBySlug.get(pillar.slug),
        sortOrder: index + 1,
      }))
    );
    if (directions.length) await db.insert(categories).values(directions);
  }

  const existingPricing = await db.select().from(pricing).limit(1);
  if (existingPricing.length === 0) {
    await db.insert(pricing).values([
      // Anthropic text models — $ per MTok
      { provider: "anthropic", model: "claude-haiku-4-5", unit: "mtok_in", priceUsd: "1" },
      { provider: "anthropic", model: "claude-haiku-4-5", unit: "mtok_out", priceUsd: "5" },
      // Sonnet 5 introductory pricing through 2026-08-31 ($3/$15 after)
      { provider: "anthropic", model: "claude-sonnet-5", unit: "mtok_in", priceUsd: "2" },
      { provider: "anthropic", model: "claude-sonnet-5", unit: "mtok_out", priceUsd: "10" },
      { provider: "anthropic", model: "claude-opus-4-8", unit: "mtok_in", priceUsd: "5" },
      { provider: "anthropic", model: "claude-opus-4-8", unit: "mtok_out", priceUsd: "25" },
      { provider: "fal", model: "fal-ai/bytedance/seedream/v5/lite/text-to-image", unit: "image", priceUsd: "0.035" },
      { provider: "fal", model: "fal-ai/bytedance/seedream/v5/lite/edit", unit: "image", priceUsd: "0.035" },
    ]);
  }

  const existingSettings = await db.select().from(appSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(appSettings).values([
      { key: "model.research", value: "claude-haiku-4-5" },
      { key: "model.drafting", value: "claude-sonnet-5" },
    ]);
  }
}
