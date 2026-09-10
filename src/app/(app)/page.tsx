import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, pillars } from "@/db/schema";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { SetupForm, type PillarGroup } from "./new/setup-form";

export const dynamic = "force-dynamic";
/**
 * Generate ideas runs on this page, and it allows itself 30 seconds plus up to
 * three web searches — see `generateTopicIdeasAction`. Vercel's default
 * function duration is far shorter than that, so the platform killed the action
 * mid-flight and the browser showed a bare "error occurred in the Server
 * Components render". Server Actions take the timeout of the page that hosts
 * them, which is why this belongs here rather than in actions.ts.
 *
 * 60 is the ceiling on every Vercel plan. If this project is on Pro it can go
 * to 300, which the streaming draft route below genuinely wants.
 */
export const maxDuration = 60;

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
    /* THE 48px MENU STRIP IS A SIBLING OF THIS PAGE, not part of it, so
       `min-h-svh` asked for a full viewport BELOW a bar that had already taken
       48 of it — the page came out exactly 48px taller than the phone and
       scrolled by that much with nothing in the gap. The composer's own
       `50svh` maths is measured against the viewport, so it stays as it is;
       what was wrong was the box around it claiming a height it does not have.

       NOT `overflow-hidden`, though, and not a fixed height. Clipping the page
       stops the composer scrolling — and stops the LIST OF TOPICS scrolling
       too, which arrives on this same route once ideas are generated and is
       taller than the screen by design. A minimum height that is honest about
       the strip is the whole fix; the composer fills it exactly and so has
       nothing to scroll. */
    <div className="cs-create-page min-h-[calc(100svh-3rem)] bg-sunken lg:min-h-svh">
      <SetupForm pillars={groups} anthropicReady={anthropicReady} />
    </div>
  );
}
