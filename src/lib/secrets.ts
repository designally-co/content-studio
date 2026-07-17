import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { encryptSecret, decryptSecret } from "./crypto";

/** User-managed image keys currently route through the Fal.ai provider. */
export type ApiKeyProvider = "fal";

export type SavedApiKey = {
  id: string;
  provider: ApiKeyProvider;
  label: string;
  /** e.g. "sk-a•••••wxyz" — never the raw value. */
  masked: string;
  createdAt: string;
};

/** A selectable saved image-key option. */
export type ApiKeyOption = { id: string; label: string };

async function rowsFor(provider: ApiKeyProvider) {
  const db = await getDb();
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.provider, provider))
    .orderBy(asc(apiKeys.createdAt));
}

export async function listApiKeys(provider: ApiKeyProvider): Promise<SavedApiKey[]> {
  const rows = await rowsFor(provider);
  return rows.map((r) => ({
    id: r.id,
    provider,
    label: r.label,
    masked: mask(decryptSecret(r.encryptedValue)),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Saved image keys for a provider. */
export async function getApiKeyOptions(provider: ApiKeyProvider): Promise<ApiKeyOption[]> {
  const saved = await listApiKeys(provider);
  return saved.map((key) => ({ id: key.id, label: key.label }));
}

/**
 * Resolve the API key to use: a specific saved key by id, else the oldest
 * saved key for the provider (the implicit default), else the env var.
 */
export async function getApiKey(
  provider: ApiKeyProvider,
  keyId?: string
): Promise<string | undefined> {
  const db = await getDb();
  if (keyId) {
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.provider, provider)))
      .limit(1);
    if (rows[0]) return decryptSecret(rows[0].encryptedValue);
    // Never silently fall back when the user explicitly selected a missing,
    // deleted, or wrong-provider key.
    return undefined;
  }
  const rows = await rowsFor(provider);
  if (rows[0]) return decryptSecret(rows[0].encryptedValue);
  return undefined;
}

export async function addApiKey(provider: ApiKeyProvider, value: string): Promise<void> {
  const db = await getDb();
  await db.delete(apiKeys).where(eq(apiKeys.provider, provider));
  await db.insert(apiKeys).values({
    provider,
    label: provider === "fal" ? "Fal.ai" : provider,
    encryptedValue: encryptSecret(value),
  });
}

export async function deleteApiKey(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}

function mask(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
