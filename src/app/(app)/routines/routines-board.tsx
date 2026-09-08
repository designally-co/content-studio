"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Clock, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { IconArrowRight } from "@/components/icons";
import { Switch } from "./switch";
import { ConfirmDelete } from "./confirm-delete";
import { WEEKDAY_NAMES } from "@/lib/autopilot/schedule";
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
  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );

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
                    finished:
                      report.status === "running"
                        ? undefined
                        : (report.status as "done" | "failed"),
                    message: report.message,
                  }
                : run,
            ),
          );

          if (report.status !== "running") {
            if (report.message)
              setFailures((all) => ({ ...all, [runId]: report.message! }));
            startTransition(() => router.refresh());
            return;
          }
        }
      } finally {
        if (driving.current === runId) driving.current = null;
      }
    },
    [router],
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
          (run) => run.finished && !rows.some((row) => row.id === run.id),
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
        {
          id: started.runId,
          routineId,
          projectId: null,
          step: "plan",
          title: "Starting…",
        },
      ]);
      startTransition(() => router.refresh());
      void drive(started.runId);
    },
    [drive, router],
  );

  // Derived from state, not from the drive loop's ref: a ref read during render
  // is not a render input, and this one decides what the buttons look like.
  const busy = live.some((run) => !run.finished);

  /* No width cap of its own. The column was held to 3xl while Library's table
     ran the full container, so the two pages shared a left edge and then
     disagreed about where the content ended — switching between them moved the
     right-hand side of the page. The container decides the width for both. */
  return (
    <div className="w-full space-y-4">
      <PageHeading
        title="Routines"
        /* One line. It was three clauses naming every stage of a run — topic,
           research, draft, cover — which the run itself reports while it
           happens. What a reader needs before they have made one is what it
           does and that nobody checks it. */
        description="Each one writes an article and sends it to the Hub, unreviewed."
        actions={
          /* Nothing to add to yet, and the empty state below already offers
             exactly this. Two primary buttons on one screen, the same colour,
             doing the same thing, is a choice with nothing on either side. */
          routines.length > 0 ? (
            <Button
              type="button"
              onClick={() => {
                setCreating(true);
                setEditing(null);
              }}
            >
              New routine
            </Button>
          ) : undefined
        }
      />

      <Readiness anthropic={anthropicReady} hub={hubReady} cron={cronReady} />

      {/* The form opens OVER the list rather than expanding inside it. Editing
          in place pushed every routine below it down the page and left the one
          being edited looking deleted; the dialog leaves the list where it is. */}
      {creating && (
        <RoutineForm
          title="New routine"
          directions={directions}
          submitLabel="Create routine"
          /* AWAITED, AND CLOSED AFTERWARDS. Closing first and saving in a
             transition left the dialog on screen with its fields cleared —
             React resets a form once its action returns, so an optimistic
             close reads as "it wiped what I typed" for as long as the write
             takes. Held open, the submit button carries the wait instead. */
          action={async (formData) => {
            await createRoutineAction(formData);
            setCreating(false);
            router.refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editing && (
        <RoutineForm
          title="Edit routine"
          routine={routines.find((routine) => routine.id === editing)}
          directions={directions}
          submitLabel="Save changes"
          action={async (formData) => {
            await updateRoutineAction(formData);
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {routines.length === 0 && <Empty onCreate={() => setCreating(true)} />}

      {routines.map((routine) => (
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
      ))}
    </div>
  );
}

function Readiness({
  anthropic,
  hub,
  cron,
}: {
  anthropic: boolean;
  hub: boolean;
  cron: boolean;
}) {
  const problems = [
    !anthropic && "The Anthropic key is not set, so nothing can be written.",
    !hub &&
      "The Hub is not configured, so there is nowhere to send finished articles.",
    !cron &&
      "CRON_SECRET is not set, so nothing will start on a schedule. Run now still works.",
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
    <EmptyState
      title="Nothing runs on its own yet"
      description="Choose what it writes about and when it runs."
      action={
        <Button type="button" onClick={onCreate}>
          Create the first one
        </Button>
      }
    />
  );
}

/**
 * The schedule, in the shortest true sentence.
 *
 * `describeSchedule` is the form's version and carries the zone — "Every
 * Monday at 09:00 (Asia/Bangkok)" — which is what the form needs while you are
 * choosing it and more than the card needs once you have. Every routine on the
 * page reads on the same clock, so naming it on each one is a parenthesis
 * repeated down the column. Twelve-hour, because that is how the time gets
 * said out loud.
 */
function cardSchedule(routine: RoutineView): string {
  if (routine.scheduleKind === "manual") return "Only when you press Run now";

  const [rawHour, rawMinute] = routine.runAt.split(":");
  const hour = Number(rawHour);
  const clock = `${((hour + 11) % 12) + 1}:${rawMinute ?? "00"} ${hour < 12 ? "am" : "pm"}`;

  if (routine.scheduleKind === "weekdays") return `Monday to Friday at ${clock}`;
  if (routine.scheduleKind === "weekly") {
    return `Every ${WEEKDAY_NAMES[routine.weekday] ?? "Monday"} at ${clock}`;
  }
  return `Every day at ${clock}`;
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
  const isManual = routine.scheduleKind === "manual";

  /* A failure the page is holding from this session outranks the stored one:
     it is the newer fact, and it is the one the reader just caused. */
  const broken = Boolean(failure) || last?.status === "failed";

  return (
    /* Borderless white on the sunken ground, the way a Library card and a
       Settings plate already are. The bordered box this used to be gave four
       routines four competing outlines on a page whose job is to be glanced
       at; the surface change carries the separation on its own. */
    <section className="rounded-2xl border border-line bg-surface p-5 transition-shadow duration-(--duration-base) ease-(--ease-out) hover:shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 flex-1 font-heading text-[length:var(--text-h3)] font-semibold leading-snug tracking-tight text-ink">
          {routine.name}
        </h3>
        {/* A manual routine has nothing to switch on, so the slot stays empty
            rather than holding the words "By hand" in the shape of a control —
            that fact is in the status mark below, and a label shaped like a
            switch invites a click that does nothing. */}
        {!isManual && (
          <Switch
            checked={enabled}
            label={`Run ${routine.name} on its schedule`}
            onChange={(nextValue) => {
              startToggle(async () => {
                setEnabled(nextValue);
                await onToggle(nextValue);
              });
            }}
          />
        )}
      </div>

      {routine.description && (
        /* Two lines, then an ellipsis. A description is context for the name,
           and one routine explaining itself at length pushes the next one off
           the screen.

           IT IS THE ONLY PROSE ON THE CARD NOW. The schedule and the last run
           were stacked under it as two more grey lines, so every routine was
           four lines deep and a list of five was twenty lines of text to scan.
           The schedule moved to the footer, where one line of metadata belongs;
           when a routine last wrote something is the Library's question. */
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-2">
          {routine.description}
        </p>
      )}

      {live && <Progress live={live} />}
      {!live && failure && <Failure message={humanise(failure)} />}
      {!live && !failure && last?.status === "failed" && <LastRun run={last} />}

      {/* EDGE TO EDGE. The rule was inside the card's padding, so it stopped
          short of both sides and read as an underline beneath the description
          rather than as a line dividing the card in two. Pulled out by the
          card's own padding and given it back as its own, it cuts. */}
      <div className="-mx-5 mt-4 flex items-center justify-between gap-3 border-t border-line px-5 pt-3.5">
        {/* The icon marks the line as a time rather than as one more sentence
            about the routine — the only thing distinguishing metadata from
            prose once the card is down to two facts. Decorative: the words
            beside it already say what it is. */}
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink-3">
          <Clock aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{cardSchedule(routine)}</span>
        </p>
        <RoutineMenu
          name={routine.name}
          running={running}
          anyRunning={anyRunning}
          broken={broken}
          onRunNow={onRunNow}
          onEdit={onEdit}
          onDelete={() => setConfirming(true)}
        />
      </div>

      <ConfirmDelete
        name={routine.name}
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
      />
    </section>
  );
}

/**
 * Why it stopped.
 *
 * On a tinted ground rather than as loose red prose in the middle of the card:
 * the message is often three lines of provider detail, and unbounded red text
 * pushed the card open and read as the loudest thing on the page. Contained, it
 * stays legible without taking the card over — and the action that answers it
 * is the button underneath, not another link inside the paragraph.
 */
function Failure({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger-ink">
      {message}
    </p>
  );
}

/**
 * Run now, Edit, Delete.
 *
 * One target rather than three competing with the name. Run now sat on the
 * card for a while and it was the loudest thing in a footer that is otherwise
 * metadata — on a list of five routines, five buttons offering to start an
 * article. It is the first item here, where a decision to start one is made
 * deliberately rather than in passing.
 */
function RoutineMenu({
  name,
  running,
  anyRunning,
  broken,
  onRunNow,
  onEdit,
  onDelete,
}: {
  name: string;
  running: boolean;
  anyRunning: boolean;
  broken: boolean;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  /* THE ICON IS AS DARK AS THE WORD IT SITS BESIDE. Held at `ink-3` it read as
     a watermark behind the label rather than as part of the item, and the two
     halves of one row disagreed about how important the row was. The
     destructive item takes its colour on BOTH halves for the same reason.

     Roomier than a compact menu: 18px icons, a 14px label at normal weight,
     and a full gutter between them. This is a short list of deliberate acts,
     not a dense toolbar, and it can afford the room. */
  /* NO COLOUR IN THE BASE. It carried `text-ink`, and adding `text-danger-ink`
     to the destructive item put two utilities of equal specificity on one
     element — which of them wins is decided by the order Tailwind happened to
     emit them in, not by the order they are written here. The delete item came
     out the same ink as the rest. Each item states its own colour instead, and
     the icons inherit it. */
  const item =
    "flex min-h-11 w-full cursor-default select-none items-center gap-3.5 rounded-lg px-3 text-base font-normal outline-none transition-colors data-disabled:pointer-events-none data-disabled:opacity-50";
  const normal = `${item} text-ink data-highlighted:bg-sunken`;
  const destructive = `${item} text-danger-ink data-highlighted:bg-danger-soft`;

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger
        aria-label={`More actions for ${name}`}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] data-[state=open]:bg-sunken data-[state=open]:text-ink"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          /* No border. The shadow already separates it from the page, and a
             hairline as well makes a floating layer look like a boxed one. */
          className="z-(--z-dropdown) w-56 rounded-2xl bg-surface p-2 shadow-[var(--shadow-pop)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none"
        >
          <DropdownMenuPrimitive.Item
            className={normal}
            disabled={anyRunning}
            onSelect={() => onRunNow()}
          >
            <Play aria-hidden className="size-[18px] shrink-0" />
            {running ? "Running…" : broken ? "Run again" : "Run now"}
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Item
            className={normal}
            onSelect={() => onEdit()}
          >
            <Pencil aria-hidden className="size-[18px] shrink-0" />
            Edit routine
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Item
            className={destructive}
            onSelect={() => onDelete()}
          >
            <Trash2 aria-hidden className="size-[18px] shrink-0" />
            Delete routine
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
      <Failure
        message={`Stopped at ${STEP_LABELS[run.step].toLowerCase()}, ${when}${
          run.error ? ` — ${humanise(run.error)}` : "."
        }`}
      />
    );
  }
  return (
    <p className="mt-3 text-sm text-ink-3">
      {run.status === "done" ? "Last wrote" : "Started"}{" "}
      {run.title === "Untitled article" ? "an article" : `“${run.title}”`},{" "}
      {when}
      {run.projectId && (
        <>
          {" · "}
          <Link
            href={`/pipeline/${run.projectId}`}
            className="underline underline-offset-2 hover:text-ink"
          >
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
          {done
            ? "Done"
            : failed
              ? `at step ${position}`
              : `${position} of ${STEP_ORDER.length}`}
        </p>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-deep">
        <div
          className={`h-full rounded-full transition-[width] duration-(--duration-base) ease-(--ease-out) ${
            failed ? "bg-destructive" : "bg-accent"
          }`}
          style={{
            width: `${Math.round((position / STEP_ORDER.length) * 100)}%`,
          }}
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
        <p
          className={`mt-2 text-sm leading-relaxed ${failed ? "text-danger-ink" : "text-ink-2"}`}
        >
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
  /* Credit before key: an account with no credit can answer 401 as well as 400,
     and "your key is wrong" would send someone to check a key that is fine. */
  if (/credit balance is too low|billing/i.test(text)) {
    return "The Anthropic account is out of credit. Add credit under Plans & Billing at console.anthropic.com, then run it again — nothing can be written until then.";
  }
  if (/authentication_error|API key is invalid|401/.test(text)) {
    return "The Anthropic key was rejected. Check ANTHROPIC_API_KEY in the deployment settings.";
  }
  if (/rate_limit|429/.test(text)) {
    return "The provider is rate limiting us. It will try again on the next run.";
  }
  if (/insufficient|payment|quota/i.test(text) && /fal|image/i.test(text)) {
    return "The image provider refused the request — usually credit. Check the Fal.ai account; the article itself is unaffected.";
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
