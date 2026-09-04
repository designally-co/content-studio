"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash, IconEdit, IconSpark } from "@/components/icons";
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
  runRoutineNowAction,
  stepRunAction,
  toggleRoutineAction,
  updateRoutineAction,
} from "./actions";
import { RoutineForm } from "./routine-form";

type Watch = {
  routineId: string;
  runId: string;
  step: RoutineStep;
  status: "running" | "done" | "failed";
  message?: string;
};

export function RoutinesBoard({
  routines,
  history,
  directions,
  anthropicReady,
  hubReady,
  cronReady,
}: {
  routines: RoutineView[];
  history: RunView[];
  directions: { id: string; name: string }[];
  anthropicReady: boolean;
  hubReady: boolean;
  cronReady: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [watch, setWatch] = useState<Watch | null>(null);
  const [, startTransition] = useTransition();

  /* One run at a time, and it stops when the page does. `stopped` is a ref
     rather than state because the loop below reads it between awaits, where a
     state value would still be the one captured when the loop started. */
  const stopped = useRef(false);
  useEffect(() => () => {
    stopped.current = true;
  }, []);

  /**
   * Drive a run to the end, one step per request.
   *
   * THE OPEN TAB IS THE TIMER. Each step is its own request with its own sixty
   * seconds, which is the only way this work fits on a serverless host, and
   * doing it from here means a run somebody started by hand finishes in a few
   * minutes rather than waiting for the next scheduled tick.
   */
  const drive = useCallback(
    async (routineId: string, runId: string) => {
      // Seven steps, and each may be retried twice before the run gives up, so
      // the ceiling is generous — but there IS one, so a bug cannot leave a tab
      // calling the server forever.
      for (let attempt = 0; attempt < 40 && !stopped.current; attempt++) {
        const report = await stepRunAction(runId);
        if (stopped.current) return;

        if (report.busy) {
          // The scheduler has it. Wait rather than fight for the claim.
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        setWatch({
          routineId,
          runId,
          step: (report.step as RoutineStep) ?? "topic",
          status: report.status === "done" || report.status === "failed" ? report.status : "running",
          message: report.message,
        });

        if (report.status !== "running") {
          startTransition(() => router.refresh());
          return;
        }
      }
    },
    [router]
  );

  const runNow = useCallback(
    async (routineId: string) => {
      setWatch({ routineId, runId: "", step: "topic", status: "running" });
      const started = await runRoutineNowAction(routineId);
      if (!started.ok) {
        setWatch({ routineId, runId: "", step: "topic", status: "failed", message: started.message });
        return;
      }
      setWatch({ routineId, runId: started.runId, step: "plan", status: "running" });
      startTransition(() => router.refresh());
      await drive(routineId, started.runId);
    },
    [drive, router]
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {!anthropicReady && (
        <Notice tone="warn">
          <strong className="font-semibold text-ink">The Anthropic key is not set.</strong> Nothing
          can be written until it is, however these routines are configured.
        </Notice>
      )}
      {!hubReady && (
        <Notice tone="warn">
          <strong className="font-semibold text-ink">The Hub is not configured.</strong> Articles
          can still be written, but there is nowhere to send them.
        </Notice>
      )}
      {!cronReady && (
        <Notice tone="warn">
          <strong className="font-semibold text-ink">CRON_SECRET is not set.</strong> Run now still
          works, but nothing will start on a schedule.
        </Notice>
      )}

      {!creating && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => { setCreating(true); setEditing(null); }}>
            New routine
          </Button>
        </div>
      )}

      {creating && (
        <RoutineForm
          directions={directions}
          action={(formData) => {
            setCreating(false);
            startTransition(async () => {
              await createRoutineAction(formData);
              router.refresh();
            });
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {routines.length === 0 && !creating && (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center text-sm text-ink-2">
          No routines yet. A routine is a saved recipe — a direction, a schedule, and what it does
          with the finished article.
        </p>
      )}

      {routines.map((routine) =>
        editing === routine.id ? (
          <RoutineForm
            key={routine.id}
            routine={routine}
            directions={directions}
            action={(formData) => {
              setEditing(null);
              startTransition(async () => {
                await updateRoutineAction(formData);
                router.refresh();
              });
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <RoutineCard
            key={routine.id}
            routine={routine}
            runs={history.filter((run) => run.routineId === routine.id).slice(0, 4)}
            watch={watch?.routineId === routine.id ? watch : null}
            busy={Boolean(watch && watch.status === "running")}
            onEdit={() => { setEditing(routine.id); setCreating(false); }}
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
        )
      )}
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "warn" }) {
  return (
    <p
      className={`rounded-2xl px-5 py-4 text-sm leading-relaxed text-ink-2 ${
        tone === "warn" ? "bg-warn-soft" : "bg-sunken"
      }`}
    >
      {children}
    </p>
  );
}

function RoutineCard({
  routine,
  runs,
  watch,
  busy,
  onEdit,
  onRunNow,
  onToggle,
  onDelete,
}: {
  routine: RoutineView;
  runs: RunView[];
  watch: Watch | null;
  busy: boolean;
  onEdit: () => void;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const schedule = describeSchedule({
    kind: routine.scheduleKind,
    runAt: routine.runAt,
    timeZone: routine.timeZone,
    weekday: routine.weekday,
  });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold text-ink">{routine.name}</h2>
          <p className="mt-1 text-sm text-ink-2">{schedule}</p>
        </div>

        {/* The switch says what it does in words as well as by position: a lone
            toggle tells you its state only if you already know which side is on. */}
        <label className="flex shrink-0 items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={routine.enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="size-5 rounded-md border-line-strong accent-[var(--orange-500)]"
          />
          <span className={routine.enabled ? "font-semibold text-ink" : "text-ink-2"}>
            {routine.enabled ? "On" : "Off"}
          </span>
        </label>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Fact label="Direction" value={routine.directionName ?? "Rotates through all of them"} />
        <Fact
          label="In the Hub"
          value={routine.hubStatus === "published" ? "Published immediately" : "Created as a draft"}
        />
        <Fact
          label="Images"
          value={routine.imagesPerRun === 0 ? "No cover" : `${routine.imagesPerRun} per article`}
        />
        <Fact label="Limit" value={`${routine.maxPerDay} article${routine.maxPerDay === 1 ? "" : "s"} a day`} />
        {routine.enabled && routine.nextRunAt && (
          <Fact
            label="Next run"
            value={new Date(routine.nextRunAt).toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        )}
      </dl>

      {watch && <Progress watch={watch} />}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={onRunNow} disabled={busy}>
          <IconSpark width={16} height={16} data-icon="inline-start" />
          {busy && watch ? "Running…" : "Run now"}
        </Button>
        <Button type="button" variant="outline" onClick={onEdit} disabled={busy}>
          <IconEdit width={16} height={16} data-icon="inline-start" />
          Edit
        </Button>
        {confirming ? (
          <>
            <Button type="button" variant="destructive" onClick={onDelete}>
              Delete for good
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
            <IconTrash width={16} height={16} data-icon="inline-start" />
            Delete
          </Button>
        )}
      </div>
      {confirming && (
        <p className="mt-2 text-sm text-ink-2">
          The articles it has written are kept — only the schedule and its history go.
        </p>
      )}

      {runs.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[var(--tracking-caps)] text-ink-3">
            Recent runs
          </h3>
          <ul className="mt-2 space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-xl bg-sunken px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {run.projectId ? (
                      <Link href={`/pipeline/${run.projectId}`} className="hover:underline">
                        {run.title}
                      </Link>
                    ) : (
                      run.title
                    )}
                  </span>
                  {/* Never colour alone: the word carries the state and the tone
                      only reinforces it. */}
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
                        ? `Failed — ${STEP_LABELS[run.step].toLowerCase()}`
                        : `Running — ${STEP_LABELS[run.step].toLowerCase()}`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-3">
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
                        View on the Hub
                      </a>
                    </>
                  )}
                </p>
                {run.error && (
                  <p className="mt-2 text-sm leading-relaxed text-danger-ink">{run.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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

/** What is happening, in words, while a run is being driven from this tab. */
function Progress({ watch }: { watch: Watch }) {
  const done = watch.status === "done";
  const failed = watch.status === "failed";
  const position = done ? STEP_ORDER.length : stepNumber(watch.step);

  return (
    <div className="mt-4 rounded-2xl bg-sunken p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {done ? "Finished" : failed ? "Stopped" : STEP_LABELS[watch.step]}
        </p>
        <p className="text-sm text-ink-3">
          {done ? "7 of 7" : `Step ${position} of ${STEP_ORDER.length}`}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-deep">
        <div
          className={`h-full rounded-full transition-[width] duration-(--duration-base) ease-(--ease-out) ${
            failed ? "bg-destructive" : "bg-accent"
          }`}
          style={{ width: `${Math.round((position / STEP_ORDER.length) * 100)}%` }}
        />
      </div>
      {!done && !failed && (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Keep this page open — it is what moves the run along. Closing it pauses the article until
          the next scheduled run picks it up.
        </p>
      )}
      {watch.message && (
        <p className={`mt-2 text-sm leading-relaxed ${failed ? "text-danger-ink" : "text-ink-2"}`}>
          {watch.message}
        </p>
      )}
    </div>
  );
}
