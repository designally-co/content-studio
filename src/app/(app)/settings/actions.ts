"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  appSettings,
  brandProfiles,
  projects,
  DEFAULT_LOGO_OVERLAY,
  users,
  type LogoOverlay,
  type LogoPosition,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
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

export type TeamActionState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Administrator access is required.");
  return user;
}

export async function manageTeamMemberAction(
  _previous: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const currentUser = await requireAdmin();
  const db = await getDb();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "create") {
      const name = String(formData.get("name") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      const password = String(formData.get("password") ?? "");
      const role = String(formData.get("role") ?? "member");
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a name and valid email address." };
      if (password.length < 8) return { error: "Password must be at least 8 characters." };
      if (role !== "admin" && role !== "member") return { error: "Choose a valid role." };
      await db.insert(users).values({ name, email, passwordHash: await hashPassword(password), role, active: true });
      revalidatePath("/settings");
      return { success: `Account created for ${email}.` };
    }

    const userId = String(formData.get("userId") ?? "");
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { error: "That account no longer exists." };

    if (intent === "role") {
      const role = String(formData.get("role") ?? "");
      if (role !== "admin" && role !== "member") return { error: "Choose a valid role." };
      if (target.id === currentUser.id && role !== "admin") return { error: "You cannot remove your own administrator access." };
      await db.update(users).set({ role }).where(eq(users.id, target.id));
      revalidatePath("/settings");
      return { success: `${target.name}'s role was updated.` };
    }

    if (intent === "password") {
      const password = String(formData.get("password") ?? "");
      if (password.length < 8) return { error: "The new password must be at least 8 characters." };
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, target.id));
      return { success: `Password reset for ${target.email}.` };
    }

    if (intent === "toggle-active") {
      if (target.id === currentUser.id) return { error: "You cannot disable your own account." };
      await db.update(users).set({ active: !target.active }).where(eq(users.id, target.id));
      revalidatePath("/settings");
      return { success: `${target.name}'s account was ${target.active ? "disabled" : "restored"}.` };
    }

    if (intent === "delete") {
      if (target.id === currentUser.id) return { error: "You cannot delete your own account." };
      // Preserve company content by transferring ownership before removing the login.
      await db.update(projects).set({ createdBy: currentUser.id }).where(eq(projects.createdBy, target.id));
      await db.update(brandProfiles).set({ createdBy: currentUser.id }).where(eq(brandProfiles.createdBy, target.id));
      await db.delete(users).where(eq(users.id, target.id));
      revalidatePath("/settings");
      return { success: `${target.name}'s account was permanently deleted.` };
    }

    return { error: "Unknown account action." };
  } catch (error) {
    if (intent === "create") return { error: "An account with that email may already exist." };
    return { error: error instanceof Error ? error.message : "The account could not be updated." };
  }
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

  const logo = await resolveLogoUpdate(formData);

  await db
    .update(brandProfiles)
    .set({
      name,
      logoOverlay: parseLogoOverlay(formData),
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
