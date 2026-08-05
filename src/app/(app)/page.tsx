import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, pillars } from "@/db/schema";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { SetupForm, type PillarGroup } from "./new/setup-form";

export const dynamic = "force-dynamic";

/** Create is the home page: the studio opens on the act it exists for. The
 *  supporting components still live under `new/`, whose own route redirects
 *  here so there is only one URL for the composer. */
export default async function CreatePage() {
  const db = await getDb();
  const [pillarRows, catRows] = await Promise.all([
    db.select().from(pillars).orderBy(asc(pillars.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  const anthropicReady = await isAnthropicConfigured();

  const groups: PillarGroup[] = pillarRows
    .filter((pillar) => pillar.active)
    .map((pillar) => ({
      id: pillar.id,
      slug: pillar.slug,
      name: pillar.name,
      tagline: pillar.tagline,
      directions: catRows
        .filter((cat) => cat.active && cat.pillarId === pillar.id)
        .map((cat) => ({ id: cat.id, name: cat.name })),
    }))
    .filter((group) => group.directions.length > 0);

  return (
    <div className="cs-create-page min-h-svh bg-sunken">
      <SetupForm pillars={groups} anthropicReady={anthropicReady} />
    </div>
  );
}
