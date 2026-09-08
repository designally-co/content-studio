"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  appSettings,
  brandProfiles,
  pricing,
  type FormatRules,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  addApiKey,
  deleteApiKey,
  listApiKeys,
  type ApiKeyProvider,
  type SavedApiKey,
} from "@/lib/secrets";
import { getBrand } from "@/lib/brand";
import { DEFAULT_ARTICLE_PROMPT, getArticleRules } from "@/lib/article-template";
import { serializeBrandStrategy } from "@/lib/designally-strategy";
import type { BrandForEditor } from "./brand-editor";

const API_KEY_PROVIDERS: ApiKeyProvider[] = ["fal"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

async function touch() {
  await requireUser();
  return getDb();
}

/**
 * Everyone who can sign in holds a Designally Workspace account and is an
 * administrator, so this passes for every real caller today. It stays because
 * it is the gate, not a formality: it is what stops these actions being
 * reachable the day accounts that are not administrators exist again.
 */
async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Administrator access is required.");
  return user;
}

// ---- categories ----
// Deliberately the only category mutation. A direction's NAME is the exact tag
// sent to the Knowledge Hub on publish (publishMetadata), so free-text adds,
// renames, and deletes all break publishing — a new name the Hub doesn't know
// is rejected, and deleting a row orphans the projects that reference it.
// Deactivating is the safe pruning tool: it only hides the direction from the
// picker on /new, is reversible, and leaves existing projects publishable.
// Taxonomy changes belong in a deliberate migration alongside the Hub's.
export async function toggleCategoryAction(formData: FormData) {
  const db = await touch();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await db.update(categories).set({ active: !active }).where(eq(categories.id, id));
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
}

// ---- models ----
// Admin-only: a wrong model id here silently breaks every generation stage.
export async function saveModelSettingsAction(formData: FormData) {
  await requireAdmin();
  const db = await getDb();
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
  revalidatePath("/", "layout");
}

// ---- api keys ----
// Admin-only: provider credentials.
export async function saveApiKeyAction(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!API_KEY_PROVIDERS.includes(provider as ApiKeyProvider) || !apiKey) return;
  await addApiKey(provider as ApiKeyProvider, apiKey);
  revalidatePath("/", "layout");
}

export async function deleteApiKeyAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteApiKey(id);
  revalidatePath("/", "layout");
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

export async function saveBrandAction(formData: FormData) {
  const db = await touch();
  // Single-brand system: always update the one brand row (create-if-missing).
  const id = String(formData.get("id") ?? "").trim() || (await getBrand()).id;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    revalidatePath("/", "layout");
    return;
  }

  const logo = await resolveLogoUpdate(formData);

  await db
    .update(brandProfiles)
    .set({
      name,
      description: String(formData.get("description") ?? "").trim(),
      tone: {
        descriptors: parseTags(formData, "toneDescriptors"),
        freeText: String(formData.get("toneFreeText") ?? "").trim(),
      },
      terminology: parseTags(formData, "terminology"),
      dos: parseTags(formData, "dos"),
      donts: parseTags(formData, "donts"),
      audience: String(formData.get("audience") ?? "").trim(),
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

  revalidatePath("/", "layout");
}

// ---- reading, for the settings sheet ----

/**
 * Everything the settings sheet shows, in one round trip.
 *
 * Settings used to be four server-rendered pages, so each one loaded exactly
 * what it needed and nothing else. A sheet has no route to hang that on, and
 * the alternative — loading it in the app layout — would charge every page in
 * the product for a panel most visits never open.
 *
 * So it loads on open, once, and switching between Brand and Content after
 * that is instant. The whole payload is a handful of small rows; splitting it
 * per section would trade a visible pause on every tab for bytes nobody is
 * counting.
 */
export type SettingsData = {
  email: string;
  isAdmin: boolean;
  brand: BrandForEditor;
  categories: { id: string; name: string; active: boolean }[];
  articleTemplate: FormatRules;
  /** Absent for non-admins — the API section is not theirs to see. */
  api: { keys: SavedApiKey[]; textModels: string[]; settings: Record<string, string> } | null;
};

export async function loadSettingsAction(): Promise<SettingsData> {
  const currentUser = await requireUser();
  const isAdmin = currentUser.role === "admin";
  const db = await getDb();

  const [brandRow, cats, articleTemplate] = await Promise.all([
    getBrand(),
    db.select().from(categories).orderBy(asc(categories.name)),
    getArticleRules(),
  ]);

  // Image bytes stay on the server; the client gets one flag and loads the
  // logo through /api/brand-logo.
  const {
    profileImageUrl,
    profileImageData,
    profileImageMime,
    logoData,
    logoMime,
    ...brandCols
  } = brandRow;
  void profileImageUrl;
  void profileImageMime;
  void logoMime;

  // The keys, prices and model routing are admin-only, and this is the boundary
  // that decides it — not the menu that chose to render the item.
  let api: SettingsData["api"] = null;
  if (isAdmin) {
    const [prices, settingsRows, savedKeys] = await Promise.all([
      db.select().from(pricing).orderBy(asc(pricing.provider), asc(pricing.model)),
      db.select().from(appSettings),
      listApiKeys("fal"),
    ]);
    api = {
      keys: savedKeys,
      textModels: Array.from(
        new Set(prices.filter((price) => price.provider === "anthropic").map((price) => price.model))
      ),
      settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
    };
  }

  return {
    email: currentUser.email,
    isAdmin,
    brand: { ...brandCols, hasLogo: logoData !== "" || profileImageData !== "" },
    categories: cats.map((c) => ({ id: c.id, name: c.name, active: c.active })),
    articleTemplate,
    api,
  };
}
