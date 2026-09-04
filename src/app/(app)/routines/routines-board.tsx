"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { MoreHorizontal } from "lucide-react";
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
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Readiness anthropic={anthropicReady} hub={hubReady} cron={cronReady} />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink-2">
          {routines.length} {routines.length === 1 ? "routine" : "routines"}
        </h2>
        {!creating && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            New routine
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
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

      {routines.length === 0 && !creating && <Empty onCreate={() => setCreating(true)} />}

      {routines.map((routine) =>
        editing === routine.id ? (
          <div key={routine.id} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <RoutineForm
              routine={routine}
              directions={directions}
              submitLabel="Save changes"
              action={(formData) => {
                setEditing(null);
                startTransition(async () => {
                  await updateRoutineAction(formData);
                  router.refresh();
                });
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <RoutineCard
            key={routine.id}
            routine={routine}
            /* The newest run only. Which article came from which routine is a
               question the Library answers; this card answers "is it working". */
            last={history.find((run) => run.routineId === routine.id) ?? null}
            live={live.find((run) => run.routineId === routine.id) ?? null}
            failure={failures[routine.id]}
            anyRunning={busy}
            onEdit={() => {
              setEditing(routine.id);
              setCreating(false);
            }}
            onRunNow={() => runNow(routine.id)}
            onToggle={async (enabled) => {
              await toggleRoutineAction(routine.id, enabled);
              router.refresh();
            }}
            onDelete={() =>
              startTransition(async () => {
                await deleteRoutineAction(routine.id);
                router.refresh();
              })
            }
          />
        )
      )}

      <p className="px-1 pt-1 text-sm leading-relaxed text-ink-3">
        Every article a routine writes appears in the Library like any other, whether it ran on its
        schedule or you pressed Run now. While this page is open it moves runs along itself; closed,
        they advance on the schedule instead.
      </p>
    </div>
  );
}

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

function RoutineCard({
  routine,
  last,
  live,
  failure,
  anyRunning,
  onEdit,
  onRunNow,
  onToggle,
  onDelete,
}: {
  routine: RoutineView;
  last: RunView | null;
  live: Live | null;
  failure?: string;
  anyRunning: boolean;
  onEdit: () => void;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  /* THE SWITCH MOVES WHEN IT IS CLICKED, not when the server agrees. Bound
     straight to the row's data it snapped back for as long as the round trip
     took — half a second of looking broken, on the one control whose whole job
     is to say what state the routine is in. */
  const [, startToggle] = useTransition();
  const [enabled, setEnabled] = useOptimistic(routine.enabled);
  const running = Boolean(live && !live.finished);
  const schedule = describeSchedule({
    kind: routine.scheduleKind,
    runAt: routine.runAt,
    timeZone: routine.timeZone,
    weekday: routine.weekday,
  });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-ink">{routine.name}</h3>
          {routine.description && (
            <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{routine.description}</p>
          )}
          <p className="mt-1.5 text-sm text-ink-3">
            {schedule}
            {enabled && routine.nextRunAt && !running && (
              <>
                {" · next "}
                {new Date(routine.nextRunAt).toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {routine.scheduleKind === "manual" ? (
            <span className="px-1.5 text-sm text-ink-3">By hand</span>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  const next = event.target.checked;
                  startToggle(async () => {
                    setEnabled(next);
                    await onToggle(next);
                  });
                }}
                className="size-5 rounded-md border-line-strong accent-[var(--orange-500)]"
                aria-label={`Run ${routine.name} on its schedule`}
              />
              <span className={enabled ? "font-semibold text-ink" : "text-ink-2"}>
                {enabled ? "On" : "Off"}
              </span>
            </label>
          )}

          <RoutineMenu
            name={routine.name}
            running={running}
            anyRunning={anyRunning}
            onRunNow={onRunNow}
            onEdit={onEdit}
            onDelete={() => setConfirming(true)}
          />
        </div>
      </div>

      {live && <Progress live={live} />}
      {!live && failure && (
        <p className="mt-3 text-sm leading-relaxed text-danger-ink">{humanise(failure)}</p>
      )}
      {!live && !failure && last && <LastRun run={last} />}

      {confirming && (
        /* Not a dialog. The question is one line and the answer is two buttons;
           a modal for that is ceremony, and it hides the thing being deleted. */
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm leading-relaxed text-ink-2">
            Delete <strong className="font-semibold text-ink">{routine.name}</strong>? The articles
            it wrote stay in the Library — only the schedule goes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
              Delete for good
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Run now, Edit, Delete — one target instead of three competing with the name. */
function RoutineMenu({
  name,
  running,
  anyRunning,
  onRunNow,
  onEdit,
  onDelete,
}: {
  name: string;
  running: boolean;
  anyRunning: boolean;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const item =
    "flex min-h-11 w-full cursor-default select-none items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors data-highlighted:bg-sunken data-disabled:pointer-events-none data-disabled:opacity-50";

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger
        aria-label={`More actions for ${name}`}
        className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] data-[state=open]:bg-sunken data-[state=open]:text-ink"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-(--z-dropdown) w-56 rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-[var(--shadow-pop)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
        >
          <DropdownMenuPrimitive.Item
            className={item}
            disabled={anyRunning}
            onSelect={() => onRunNow()}
          >
            <IconSpark width={16} height={16} className="text-ink-3" />
            {running ? "Running…" : "Run now"}
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Item className={item} onSelect={() => onEdit()}>
            <IconEdit width={16} height={16} className="text-ink-3" />
            Edit
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />
          <DropdownMenuPrimitive.Item
            className={`${item} text-danger-ink`}
            onSelect={() => onDelete()}
          >
            <IconTrash width={16} height={16} />
            Delete
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

/**
 * How the last run went, in one line.
 *
 * Not a history list. Which article came from which routine is the Library's
 * question, and answering it twice meant a page of run rows nobody read. What a
 * routine has to say for itself is whether it is working.
 */
function LastRun({ run }: { run: RunView }) {
  const when = new Date(run.startedAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (run.status === "failed") {
    return (
      <p className="mt-3 text-sm leading-relaxed text-danger-ink">
        <span className="font-semibold">Last run stopped</span> at{" "}
        {STEP_LABELS[run.step].toLowerCase()}, {when}
        {run.error ? ` — ${humanise(run.error)}` : "."}
      </p>
    );
  }
  return (
    <p className="mt-3 text-sm text-ink-3">
      {run.status === "done" ? "Last wrote" : "Started"} {run.title === "Untitled article" ? "an article" : `“${run.title}”`}, {when}
      {run.projectId && (
        <>
          {" · "}
          <Link href={`/pipeline/${run.projectId}`} className="underline underline-offset-2 hover:text-ink">
            open it
          </Link>
        </>
      )}
    </p>
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
