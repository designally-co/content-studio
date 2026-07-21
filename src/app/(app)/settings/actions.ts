"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  pricing,
  appSettings,
  brandProfiles,
  DEFAULT_LOGO_OVERLAY,
  type LogoOverlay,
  type LogoPosition,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { addApiKey, deleteApiKey, type ApiKeyProvider } from "@/lib/secrets";
import { getBrand } from "@/lib/brand";
import { DEFAULT_ARTICLE_PROMPT } from "@/lib/article-template";
import { serializeBrandStrategy } from "@/lib/designally-strategy";

const PRICING_PROVIDERS = ["anthropic", "fal"] as const;
const API_KEY_PROVIDERS: ApiKeyProvider[] = ["fal"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

async function touch() {
  await requireUser();
  return getDb();
}

// ---- categories ----
export async function addCategoryAction(formData: FormData) {
  const db = await touch();
  const name = String(formData.get("name") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim();
  if (name) await db.insert(categories).values({ name, nameTh });
  revalidatePath("/settings");
}

export async function toggleCategoryAction(formData: FormData) {
  const db = await touch();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await db.update(categories).set({ active: !active }).where(eq(categories.id, id));
  revalidatePath("/settings");
}

export async function deleteCategoryAction(formData: FormData) {
  const db = await touch();
  const id = String(formData.get("id"));
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/settings");
}

// ---- article template ----
export async function saveArticleTemplateAction(formData: FormData) {
  const db = await touch();
  const prompt = String(formData.get("prompt") ?? "").trim() || DEFAULT_ARTICLE_PROMPT;
  const length = String(formData.get("length") ?? "").trim() || "1,200–2,000 words";
  for (const [key, value] of [["article.prompt", prompt], ["article.length", length]] as const) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }
  revalidatePath("/settings");
}

// ---- models ----
export async function saveModelSettingsAction(formData: FormData) {
  const db = await touch();
  const research = String(formData.get("research") ?? "").trim();
  const drafting = String(formData.get("drafting") ?? "").trim();
  for (const [key, value] of [
    ["model.research", research],
    ["model.drafting", drafting],
  ] as const) {
    if (!value) continue;
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }
  revalidatePath("/settings");
}

// ---- api keys ----
export async function saveApiKeyAction(formData: FormData) {
  await touch();
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!API_KEY_PROVIDERS.includes(provider as ApiKeyProvider) || !apiKey) return;
  await addApiKey(provider as ApiKeyProvider, apiKey);
  revalidatePath("/settings");
}

export async function deleteApiKeyAction(formData: FormData) {
  await touch();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteApiKey(id);
  revalidatePath("/settings");
}

// ---- pricing ----
export async function updatePriceAction(formData: FormData) {
  const db = await touch();
  const id = String(formData.get("id"));
  const priceUsd = String(formData.get("priceUsd") ?? "0").trim();
  if (!/^\d*\.?\d+$/.test(priceUsd)) return;
  await db.update(pricing).set({ priceUsd }).where(eq(pricing.id, id));
  revalidatePath("/settings");
}

export async function addPriceAction(formData: FormData) {
  const db = await touch();
  const provider = String(formData.get("provider") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const unit = String(formData.get("unit") ?? "");
  const priceUsd = String(formData.get("priceUsd") ?? "0").trim();
  if (!PRICING_PROVIDERS.includes(provider as (typeof PRICING_PROVIDERS)[number]) || !model) return;
  if (unit !== "mtok_in" && unit !== "mtok_out" && unit !== "image") return;
  if (!/^\d*\.?\d+$/.test(priceUsd)) return;
  await db.insert(pricing).values({ provider, model, unit, priceUsd });
  revalidatePath("/settings");
}

export async function deletePriceAction(formData: FormData) {
  const db = await touch();
  const id = String(formData.get("id"));
  await db.delete(pricing).where(eq(pricing.id, id));
  revalidatePath("/settings");
}

// ---- brand (singleton) ----
function parseTags(form: FormData, key: string): string[] {
  try {
    const v = JSON.parse(String(form.get(key) ?? "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Resolve the single brand identity image used in the UI and on generated images. */
async function resolveLogoUpdate(
  form: FormData
): Promise<{ logoData: string; logoMime: string } | undefined> {
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
      return undefined;
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { logoData: base64, logoMime: file.type };
  }
  if (String(form.get("removeLogo") ?? "") === "1") {
    return { logoData: "", logoMime: "" };
  }
  return undefined;
}

const LOGO_POSITIONS: LogoPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
];

/** Parse + clamp the logo-overlay settings from the form, defaulting safely. */
function parseLogoOverlay(form: FormData): LogoOverlay {
  try {
    const raw = JSON.parse(String(form.get("logoOverlay") ?? "")) as Partial<LogoOverlay>;
    const position = LOGO_POSITIONS.includes(raw.position as LogoPosition)
      ? (raw.position as LogoPosition)
      : DEFAULT_LOGO_OVERLAY.position;
    const sizePct = Math.min(60, Math.max(1, Number(raw.sizePct) || DEFAULT_LOGO_OVERLAY.sizePct));
    const opacity = Math.min(1, Math.max(0, Number(raw.opacity) ?? DEFAULT_LOGO_OVERLAY.opacity));
    return { position, sizePct, opacity, shadow: Boolean(raw.shadow) };
  } catch {
    return DEFAULT_LOGO_OVERLAY;
  }
}

export async function saveBrandAction(formData: FormData) {
  const db = await touch();
  // Single-brand system: always update the one brand row (create-if-missing).
  const id = String(formData.get("id") ?? "").trim() || (await getBrand()).id;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    revalidatePath("/settings");
    return;
  }

  const languages = parseTags(formData, "languages").filter(
    (l): l is "th" | "en" => l === "th" || l === "en"
  );

  const logo = await resolveLogoUpdate(formData);

  await db
    .update(brandProfiles)
    .set({
      name,
      logoOverlay: parseLogoOverlay(formData),
      description: String(formData.get("description") ?? "").trim(),
      languages: languages.length ? languages : (["en"] as ("th" | "en")[]),
      tone: {
        descriptors: parseTags(formData, "toneDescriptors"),
        freeText: String(formData.get("toneFreeText") ?? "").trim(),
      },
      terminology: parseTags(formData, "terminology"),
      dos: parseTags(formData, "dos"),
      donts: parseTags(formData, "donts"),
      audience: String(formData.get("audience") ?? "").trim(),
      defaults: {
        cta: String(formData.get("cta") ?? "").trim(),
        links: String(formData.get("links") ?? "").trim(),
        hashtags: String(formData.get("hashtags") ?? "").trim(),
      },
      guidelineText: serializeBrandStrategy({
        purpose: String(formData.get("strategyPurpose") ?? ""),
        positioning: String(formData.get("strategyPositioning") ?? ""),
        values: String(formData.get("strategyValues") ?? ""),
        voice: String(formData.get("strategyVoice") ?? ""),
        audiences: String(formData.get("strategyAudiences") ?? ""),
        messaging: String(formData.get("strategyMessaging") ?? ""),
        additionalGuidelines: String(formData.get("strategyAdditional") ?? ""),
      }),
      ...(logo ?? {}),
    })
    .where(eq(brandProfiles.id, id));

  revalidatePath("/settings");
}
