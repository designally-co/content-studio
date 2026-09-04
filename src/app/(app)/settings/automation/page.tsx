import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { getRoutine, recentRuns } from "@/lib/autopilot/runner";
import { isHubConfigured } from "@/lib/hub";
import { requireUser } from "@/lib/session";
import { saveRoutineAction } from "../actions";
import { Section } from "../section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

/**
 * The autopilot's one screen: the switch, four settings, and what it has done.
 *
 * The history is not a nicety. This is the only surface in the product where
 * the machine acts with nobody watching, so "what did it publish, and did
 * anything fail" has to be answerable here — otherwise the honest answer is
 * "look in the database".
 */
export default async function AutomationSettingsPage() {
  // Administrators only, like API & models — hiding it in the nav is not a
  // control, and this page both shows what was published unattended and offers
  // the switch that keeps doing it.
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") notFound();

  const db = await getDb();
  const [routine, runs, directions] = await Promise.all([
    getRoutine(),
    recentRuns(20),
    db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name)),
  ]);
  const hubReady = isHubConfigured();
  const cronReady = Boolean(process.env.CRON_SECRET);

  return (
    <>
      <Section
        title="Autopilot"
        description="Writes one article on a schedule — topic, research, draft, cover image — and sends it to the Knowledge Hub. Nobody reviews it on the way."
      >
        {/* Said before the switch, not after it. Both of these stop the
            autopilot dead, and finding that out from an empty history a day
            later is the worse way to learn it. */}
        {!cronReady && (
          <p className="rounded-2xl bg-warn-soft px-5 py-4 text-sm leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">CRON_SECRET is not set.</strong> The
            endpoint that drives the autopilot refuses to run without it, so nothing will happen
            however this page is configured.
          </p>
        )}
        {!hubReady && (
          <p className="rounded-2xl bg-warn-soft px-5 py-4 text-sm leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">The Hub is not configured.</strong> Articles
            can still be written, but there is nowhere to send them.
          </p>
        )}

        <form action={saveRoutineAction} className="space-y-6">
          <label className="flex items-start gap-3 rounded-2xl bg-surface p-4">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={routine.enabled}
              className="mt-0.5 size-5 shrink-0 rounded-md border-line-strong accent-[var(--orange-500)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Run the autopilot</span>
              <span className="mt-1 block text-sm leading-relaxed text-ink-2">
                Off by default. While this is on, articles are written and sent without anyone
                approving them.
              </span>
            </span>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Content direction</Label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={routine.categoryId ?? ""}
                className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink"
              >
                {/* Rotation is the default because a schedule pinned to one
                    direction publishes the same corner of the territory daily. */}
                <option value="">Rotate through all of them</option>
                {directions.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hubStatus">What it creates in the Hub</Label>
              <select
                id="hubStatus"
                name="hubStatus"
                defaultValue={routine.hubStatus}
                className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink"
              >
                <option value="draft">A draft — somebody publishes it</option>
                <option value="published">Published — live immediately</option>
              </select>
              <p className="text-sm leading-relaxed text-ink-2">
                A Hub draft keeps one human gate at the far end while everything before it stays
                automatic. It is the safer of the two by a wide margin.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPerDay">Articles per day</Label>
              <Input
                id="maxPerDay"
                name="maxPerDay"
                type="number"
                min={1}
                max={5}
                defaultValue={routine.maxPerDay}
              />
              <p className="text-sm leading-relaxed text-ink-2">
                A ceiling a mistake cannot spend past. Capped at five whatever is typed here.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagesPerRun">Images per article</Label>
              <Input
                id="imagesPerRun"
                name="imagesPerRun"
                type="number"
                min={0}
                max={4}
                defaultValue={routine.imagesPerRun}
              />
              <p className="text-sm leading-relaxed text-ink-2">
                Zero writes the article without a cover. The first image generated becomes it.
              </p>
            </div>
          </div>

          <Button type="submit">Save</Button>
        </form>
      </Section>

      <Section
        title="History"
        description="Every run the autopilot has started, most recent first."
      >
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing has run yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => {
              const title =
                (run.title as { title?: string } | null)?.title ?? "Untitled article";
              const hubUrl = (run.publishedTo as Record<string, string> | null)?.knowledgeHub;
              return (
                <li key={run.id} className="rounded-xl bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {run.projectId ? (
                        <Link href={`/pipeline/${run.projectId}`} className="hover:underline">
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </span>
                    {/* Never colour alone: the word carries the state and the
                        tone only reinforces it. */}
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        run.status === "failed"
                          ? "text-danger-ink"
                          : run.status === "done"
                            ? "text-ink-2"
                            : "text-accent-press"
                      }`}
                    >
                      {run.status === "done"
                        ? "Published"
                        : run.status === "failed"
                          ? `Failed at ${run.step}`
                          : `Running — ${run.step}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-3">
                    {new Date(run.startedAt).toLocaleString()}
                    {hubUrl && (
                      <>
                        {" · "}
                        <a
                          href={hubUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline underline-offset-2 hover:text-ink"
                        >
                          View on the Hub
                        </a>
                      </>
                    )}
                  </p>
                  {run.error && (
                    <p className="mt-2 text-sm leading-relaxed text-danger-ink">{run.error}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
