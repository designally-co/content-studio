import "server-only";
import { asc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb } from "@/db";
import { brandProfiles } from "@/db/schema";

export type Brand = InferSelectModel<typeof brandProfiles>;

/**
 * The app is single-brand (Designally). There is exactly one brand profile for
 * the whole system, edited in Settings and used everywhere. This returns that
 * singleton, creating a default row if none exists yet so callers never have to
 * handle an empty state.
 */
export async function getBrand(): Promise<Brand> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(brandProfiles)
    .orderBy(asc(brandProfiles.createdAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(brandProfiles)
    .values({ name: "Designally" })
    .returning();
  return created;
}

/** The single brand's id — handy where only the id is needed (e.g. image URL). */
export async function getBrandId(): Promise<string> {
  return (await getBrand()).id;
}
