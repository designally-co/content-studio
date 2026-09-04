"use server";

import { routines } from "@/db/schema";
import { getRoutine } from "@/lib/autopilot/runner";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  appSettings,
  brandProfiles,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { addApiKey, deleteApiKey, type ApiKeyProvider } from "@/lib/secrets";
import { getBrand } from "@/lib/brand";
import { DEFAULT_ARTICLE_PROMPT } from "@/lib/article-template";
import { serializeBrandStrategy } from "@/lib/designally-strategy";

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
  revalidatePath("/settings");
}

// ---- api keys ----
// Admin-only: provider credentials.
export async function saveApiKeyAction(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!API_KEY_PROVIDERS.includes(provider as ApiKeyProvider) || !apiKey) return;
  await addApiKey(provider as ApiKeyProvider, apiKey);
  revalidatePath("/settings");
}

export async function deleteApiKeyAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteApiKey(id);
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

export async function saveBrandAction(formData: FormData) {
  const db = await touch();
  // Single-brand system: always update the one brand row (create-if-missing).
  const id = String(formData.get("id") ?? "").trim() || (await getBrand()).id;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    revalidatePath("/settings");
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

  revalidatePath("/settings");
}

// ---- autopilot ----

/**
 * Change the schedule that writes and publishes without an editor.
 *
 * Administrator-only, like the model and provider settings, and for a stronger
 * reason: this switch decides whether the machine posts to a live site on its
 * own. `enabled` is read as an explicit "on" rather than as the presence of a
 * checkbox value, so a malformed submission cannot switch it on by accident.
 */
export async function saveRoutineAction(formData: FormData) {
  await requireAdmin();
  const db = await getDb();
  const routine = await getRoutine();

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const hubStatus = String(formData.get("hubStatus") ?? "") === "published" ? "published" : "draft";
  const clamp = (value: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
    const parsed = Number(String(value ?? ""));
    return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
  };

  await db
    .update(routines)
    .set({
      enabled: String(formData.get("enabled") ?? "") === "on",
      categoryId: categoryId || null,
      hubStatus,
      imagesPerRun: clamp(formData.get("imagesPerRun"), 0, 4, routine.imagesPerRun),
      // Capped at 5 whatever is submitted. The point of this number is to be a
      // ceiling a mistake cannot spend past, so it needs one of its own.
      maxPerDay: clamp(formData.get("maxPerDay"), 1, 5, routine.maxPerDay),
    })
    .where(eq(routines.id, routine.id));

  revalidatePath("/settings/automation");
}
