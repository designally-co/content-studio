"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash, IconEdit, IconSpark, IconArrowRight } from "@/components/icons";
import { describeSchedule } from "@/lib/autopilot/schedule";
import {
  STEP_LABELS,
  STEP_ORDER,
  stepNumber,
  type RoutineView,
  type RunView,
} from "@/lib/autopilot/views";
import type { RoutineStep } from "@/db/schema";
import {
  createRoutineAction,
  deleteRoutineAction,
  liveRunsAction,
  runRoutineNowAction,
  stepRunAction,
  toggleRoutineAction,
  updateRoutineAction,
  type LiveRun,
} from "./actions";
import { RoutineForm } from "./routine-form";

/** How often the page asks the server what is still running. */
const POLL_MS = 4000;

type Live = LiveRun & { finished?: "done" | "failed"; message?: string };

export function RoutinesBoard({
  routines,
  history,
  directions,
  anthropicReady,
  hubReady,
  cronReady,
  initialLive,
}: {
  routines: RoutineView[];
  history: RunView[];
  directions: { id: string; name: string }[];
  anthropicReady: boolean;
  hubReady: boolean;
  cronReady: boolean;
  initialLive: LiveRun[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [live, setLive] = useState<Live[]>(initialLive);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  /* One drive loop per tab, and it stops when the page does. A ref, not state:
     the loop reads it between awaits, where a state value would still be the
     one captured when the loop started. */
  const driving = useRef<string | null>(null);
  const gone = useRef(false);
  useEffect(() => () => {
    gone.current = true;
  }, []);

  /**
   * Move a run along, one request per step, until it ends.
   *
   * THIS TAB IS THE TIMER while it is open. The scheduler advances a run every
   * five minutes; a page that is being watched can do it as fast as the steps
   * complete, which is the difference between watching an article being written
   * and coming back to it later.
   */
  const drive = useCallback(
    async (runId: string) => {
      if (driving.current) return;
      driving.current = runId;
      try {
        // Seven steps, each retried twice at most — a generous ceiling, but a
        // ceiling, so a bug cannot leave a tab calling the server forever.
        for (let attempt = 0; attempt < 40 && !gone.current; attempt++) {
          const report = await stepRunAction(runId);
          if (gone.current) return;

          if (report.busy) {
            // A scheduler has it. Wait rather than fight over the claim.
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }

          setLive((current) =>
            current.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    step: report.step,
                    finished: report.status === "running" ? undefined : (report.status as "done" | "failed"),
                    message: report.message,
                  }
                : run
            )
          );

          if (report.status !== "running") {
            if (report.message) setFailures((all) => ({ ...all, [runId]: report.message! }));
            startTransition(() => router.refresh());
            return;
          }
        }
      } finally {
        if (driving.current === runId) driving.current = null;
      }
    },
    [router]
  );

  /* Pick up whatever is already running, including a run this tab did not
     start. Without this, reloading the page during a run loses sight of it and
     the article waits for the next tick — the run was never lost, but it looked
     like it was, which is the same thing to whoever is watching. */
  useEffect(() => {
    let cancelled = false;
    const first = live.find((run) => !run.finished);
    if (first && !driving.current) void drive(first.id);

    if (live.every((run) => run.finished)) return;
    const timer = setInterval(async () => {
      const rows = await liveRunsAction();
      if (cancelled) return;
      setLive((current) => {
        // Keep a just-finished run on screen until the page data catches up.
        const finished = current.filter(
          (run) => run.finished && !rows.some((row) => row.id === run.id)
        );
        return [...rows, ...finished];
      });
      if (rows.length === 0) startTransition(() => router.refresh());
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, drive, router]);

  const runNow = useCallback(
    async (routineId: string) => {
      setFailures((all) => {
        const next = { ...all };
        delete next[routineId];
        return next;
      });
      const started = await runRoutineNowAction(routineId);
      if (!started.ok) {
        setFailures((all) => ({ ...all, [routineId]: started.message }));
        return;
      }
      setLive((current) => [
        ...current,
        { id: started.runId, routineId, projectId: null, step: "plan", title: "Starting…" },
      ]);
      startTransition(() => router.refresh());
      void drive(started.runId);
    },
    [drive, router]
  );

  // Derived from state, not from the drive loop's ref: a ref read during render
  // is not a render input, and this one decides what the buttons look like.
  const busy = live.some((run) => !run.finished);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Readiness anthropic={anthropicReady} hub={hubReady} cron={cronReady} />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">
            {routines.length} {routines.length === 1 ? "routine" : "routines"}
          </h2>
          {!creating && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreating(true);
                setEditing(null);
                setOpen(null);
              }}
            >
              New routine
            </Button>
          )}
        </div>

        {creating && (
          <div className="border-b border-line px-5 py-5">
            <RoutineForm
              directions={directions}
              submitLabel="Create routine"
              action={(formData) => {
                setCreating(false);
                startTransition(async () => {
                  await createRoutineAction(formData);
                  router.refresh();
                });
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}

        {routines.length === 0 && !creating ? (
          <Empty onCreate={() => setCreating(true)} />
        ) : (
          <ul className="divide-y divide-line">
            {routines.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                runs={history.filter((run) => run.routineId === routine.id)}
                live={live.find((run) => run.routineId === routine.id) ?? null}
                failure={failures[routine.id]}
                anyRunning={busy}
                expanded={open === routine.id}
                editing={editing === routine.id}
                directions={directions}
                onToggleOpen={() =>
                  setOpen((current) => (current === routine.id ? null : routine.id))
                }
                onEdit={() => {
                  setEditing(routine.id);
                  setOpen(routine.id);
                  setCreating(false);
                }}
                onCancelEdit={() => setEditing(null)}
                onSave={(formData) => {
                  setEditing(null);
                  startTransition(async () => {
                    await updateRoutineAction(formData);
                    router.refresh();
                  });
                }}
                onRunNow={() => runNow(routine.id)}
                onToggle={(enabled) =>
                  startTransition(async () => {
                    await toggleRoutineAction(routine.id, enabled);
                    router.refresh();
                  })
                }
                onDelete={() =>
                  startTransition(async () => {
                    await deleteRoutineAction(routine.id);
                    router.refresh();
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      <p className="px-1 text-sm leading-relaxed text-ink-3">
        A routine writes and sends an article with nobody reading it first. While this page is open
        it moves runs along itself; closed, they advance on the schedule instead.
      </p>
    </div>
  );
}

/** Only says anything when something is actually missing. */
function Readiness({ anthropic, hub, cron }: { anthropic: boolean; hub: boolean; cron: boolean }) {
  const problems = [
    !anthropic && "The Anthropic key is not set, so nothing can be written.",
    !hub && "The Hub is not configured, so there is nowhere to send finished articles.",
    !cron && "CRON_SECRET is not set, so nothing will start on a schedule. Run now still works.",
  ].filter(Boolean) as string[];
  if (problems.length === 0) return null;
  return (
    <div className="rounded-2xl bg-warn-soft px-5 py-4">
      <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-semibold text-ink">Nothing runs on its own yet</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-2">
        A routine is a saved recipe: a content direction, when to run, and what to do with the
        finished article. You can start one by hand at any time, whether or not it has a schedule.
      </p>
      <Button type="button" className="mt-5" onClick={onCreate}>
        Create the first one
      </Button>
    </div>
  );
}

function RoutineRow({
  routine,
  runs,
  live,
  failure,
  anyRunning,
  expanded,
  editing,
  directions,
  onToggleOpen,
  onEdit,
  onCancelEdit,
  onSave,
  onRunNow,
  onToggle,
  onDelete,
}: {
  routine: RoutineView;
  runs: RunView[];
  live: Live | null;
  failure?: string;
  anyRunning: boolean;
  expanded: boolean;
  editing: boolean;
  directions: { id: string; name: string }[];
  onToggleOpen: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (formData: FormData) => void;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const running = Boolean(live && !live.finished);
  const schedule = describeSchedule({
    kind: routine.scheduleKind,
    runAt: routine.runAt,
    timeZone: routine.timeZone,
    weekday: routine.weekday,
  });

  return (
    <li>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h3 className="font-heading text-base font-bold text-ink">{routine.name}</h3>
              {/* The state is a word first. Colour only reinforces it. */}
              {running ? (
                <span className="text-sm font-semibold text-accent-press">Running</span>
              ) : routine.enabled && routine.nextRunAt ? (
                <span className="text-sm text-ink-3">
                  {`Next ${new Date(routine.nextRunAt).toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-ink-2">
              {schedule} · {routine.directionName ?? "All directions in turn"} ·{" "}
              {routine.hubStatus === "published" ? "publishes live" : "sends a draft"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
              <input
                type="checkbox"
                checked={routine.enabled}
                onChange={(event) => onToggle(event.target.checked)}
                className="size-5 rounded-md border-line-strong accent-[var(--orange-500)]"
                aria-label={`Run ${routine.name} on its schedule`}
              />
              <span className={routine.enabled ? "font-semibold text-ink" : "text-ink-2"}>
                {routine.enabled ? "On" : "Off"}
              </span>
            </label>
            <Button
              type="button"
              size="sm"
              onClick={onRunNow}
              disabled={anyRunning}
              title={anyRunning && !running ? "Another run is in progress" : undefined}
            >
              <IconSpark width={15} height={15} data-icon="inline-start" />
              {running ? "Running…" : "Run now"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onToggleOpen}
              aria-expanded={expanded}
            >
              {expanded ? "Close" : "Details"}
            </Button>
          </div>
        </div>

        {live && <Progress live={live} />}
        {failure && !live && (
          <p className="mt-3 text-sm leading-relaxed text-danger-ink">{humanise(failure)}</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-line px-5 py-5">
          {editing ? (
            <RoutineForm
              routine={routine}
              directions={directions}
              submitLabel="Save changes"
              action={onSave}
              onCancel={onCancelEdit}
            />
          ) : (
            <>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Fact label="Direction" value={routine.directionName ?? "Rotates through all of them"} />
                <Fact
                  label="In the Hub"
                  value={routine.hubStatus === "published" ? "Published immediately" : "Created as a draft"}
                />
                <Fact
                  label="Images"
                  value={routine.imagesPerRun === 0 ? "No cover" : `${routine.imagesPerRun} per article`}
                />
                <Fact
                  label="Scheduled limit"
                  value={`${routine.maxPerDay} a day`}
                />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onEdit}>
                  <IconEdit width={15} height={15} data-icon="inline-start" />
                  Edit settings
                </Button>
                {confirming ? (
                  <>
                    <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
                      Delete for good
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                      Keep it
                    </Button>
                    <p className="w-full text-sm text-ink-2">
                      The articles it has written stay in the Library. Only the schedule and its run
                      history go.
                    </p>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                    <IconTrash width={15} height={15} data-icon="inline-start" />
                    Delete
                  </Button>
                )}
              </div>

              <h4 className="mt-6 text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
                Runs
              </h4>
              {runs.length === 0 ? (
                <p className="mt-2 text-sm text-ink-2">It has not run yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {runs.slice(0, 6).map((run) => (
                    <li key={run.id} className="py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {run.projectId ? (
                            <Link
                              href={`/pipeline/${run.projectId}`}
                              className="font-medium hover:underline"
                            >
                              {run.title}
                            </Link>
                          ) : (
                            run.title
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-sm ${
                            run.status === "failed"
                              ? "font-semibold text-danger-ink"
                              : run.status === "done"
                                ? "text-ink-2"
                                : "font-semibold text-accent-press"
                          }`}
                        >
                          {run.status === "done"
                            ? "Published"
                            : run.status === "failed"
                              ? `Stopped at ${STEP_LABELS[run.step].toLowerCase()}`
                              : `Running — ${STEP_LABELS[run.step].toLowerCase()}`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {new Date(run.startedAt).toLocaleString()}
                        {run.hubUrl && (
                          <>
                            {" · "}
                            <a
                              href={run.hubUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="underline underline-offset-2 hover:text-ink"
                            >
                              On the Hub
                            </a>
                          </>
                        )}
                      </p>
                      {run.error && (
                        <p className="mt-1 text-sm leading-relaxed text-danger-ink">
                          {humanise(run.error)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{value}</dd>
    </div>
  );
}

/** The step, in words, with a rule that fills as the article is written. */
function Progress({ live }: { live: Live }) {
  const done = live.finished === "done";
  const failed = live.finished === "failed";
  const step = (live.step as RoutineStep) ?? "topic";
  const position = done ? STEP_ORDER.length : stepNumber(step);

  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="text-sm font-medium text-ink">
          {done ? "Finished" : failed ? "Stopped" : STEP_LABELS[step]}
          {live.title && live.title !== "Untitled article" && !done && (
            <span className="text-ink-2"> · {live.title}</span>
          )}
        </p>
        <p className="text-sm text-ink-3">
          {done ? "Done" : failed ? `at step ${position}` : `${position} of ${STEP_ORDER.length}`}
        </p>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-deep">
        <div
          className={`h-full rounded-full transition-[width] duration-(--duration-base) ease-(--ease-out) ${
            failed ? "bg-destructive" : "bg-accent"
          }`}
          style={{ width: `${Math.round((position / STEP_ORDER.length) * 100)}%` }}
        />
      </div>
      {done && live.projectId && (
        <p className="mt-2 text-sm">
          <Link
            href={`/pipeline/${live.projectId}`}
            className="inline-flex items-center gap-1.5 font-medium text-accent-ink underline-offset-4 hover:underline"
          >
            Read what it wrote
            <IconArrowRight width={14} height={14} />
          </Link>
        </p>
      )}
      {live.message && (
        <p className={`mt-2 text-sm leading-relaxed ${failed ? "text-danger-ink" : "text-ink-2"}`}>
          {humanise(live.message)}
        </p>
      )}
    </div>
  );
}

/**
 * Provider errors arrive as a status code and a wall of JSON. Say the thing,
 * and keep the raw text only when it is not one we recognise — an unknown
 * failure is worse to hide than to print badly.
 */
function humanise(message: string): string {
  const text = message.trim();
  if (/authentication_error|API key is invalid|401/.test(text)) {
    return "The Anthropic key was rejected. Check ANTHROPIC_API_KEY in the deployment settings.";
  }
  if (/rate_limit|429/.test(text)) {
    return "The provider is rate limiting us. It will try again on the next run.";
  }
  if (/took longer than|timed out|ETIMEDOUT/.test(text)) {
    return text.replace(/\s+/g, " ");
  }
  if (/No active content direction/.test(text)) {
    return "No content direction is active. Turn one on in Settings → Content.";
  }
  if (/HUB_BASE_URL|HUB_API_KEY/.test(text)) {
    return "The Knowledge Hub is not configured, so the article could not be sent.";
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
