import { categories, pricing, appSettings } from "./schema";
import type { DB } from "./index";

/**
 * Seeds reference data on first boot (categories, pricing,
 * default model settings). Idempotent: runs only when the target table is empty.
 * Prices are indicative at build time (July 2026) and editable in Settings.
 */
export async function seedIfEmpty(db: DB) {
  const existingCats = await db.select().from(categories).limit(1);
  if (existingCats.length === 0) {
    await db.insert(categories).values([
      { name: "Web Design", nameTh: "ออกแบบเว็บไซต์" },
      { name: "SEO", nameTh: "เอสอีโอ" },
      { name: "E-commerce", nameTh: "อีคอมเมิร์ซ" },
      { name: "AI Tools", nameTh: "เครื่องมือ AI" },
      { name: "Company News", nameTh: "ข่าวสารบริษัท" },
    ]);
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
