"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Dialog, Collapsible } from "radix-ui";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "./switch";
import {
  TIME_ZONES,
  WEEKDAY_NAMES,
  describeSchedule,
  nextRunAt,
  type RoutineScheduleKind,
} from "@/lib/autopilot/schedule";
import type { RoutineView } from "@/lib/autopilot/views";

/**
 * One routine's settings, as a dialog.
 *
 * The same form creates and edits — the only difference is a hidden id and
 * which action it posts to — because two forms that must stay identical
 * eventually stop being identical.
 *
 * WHAT IT IS BEFORE WHEN IT RUNS. Name, then description, then the schedule:
 * the description used to sit at the bottom under the heading "Prompt", which
 * put the sentence explaining a routine below every mechanical detail of it.
 * You decide what a thing is for before you decide what time it happens.
 *
 * THE SCHEDULE IS ONE ROW THAT CHANGES SHAPE. Cadence first, then only the
 * fields that cadence actually needs — a weekday appears for a weekly routine
 * and for nothing else, and a routine run by hand shows no time at all,
 * because there is no time at which it happens.
 */

/** A filled control on the dialog's own ground: no border, the fill is the field. */
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border-0 bg-deep px-4 text-sm text-ink outline-none transition-shadow focus-visible:shadow-[var(--shadow-focus)]";

/** The same, for a `select`, which needs room for its own chevron. */
const SELECT = `${FIELD} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237a6e66%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')] bg-[length:18px] bg-[position:right_0.75rem_center] bg-no-repeat pr-10`;

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * A setting that is a decision rather than a value: a white plate on the
 * dialog's ground, its consequence spelled out under its name.
 */
function Plate({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-surface p-4 sm:p-5">{children}</div>;
}

export function RoutineForm({
  routine,
  directions,
  action,
  onCancel,
  submitLabel,
  title,
}: {
  routine?: RoutineView;
  directions: { id: string; name: string }[];
  action: (formData: FormData) => void;
  onCancel: () => void;
  submitLabel: string;
  title: string;
}) {
  const [kind, setKind] = useState<RoutineScheduleKind>(routine?.scheduleKind ?? "daily");
  const [runAt, setRunAt] = useState(routine?.runAt ?? "09:00");
  const [timeZone, setTimeZone] = useState(routine?.timeZone ?? "Asia/Bangkok");
  const [weekday, setWeekday] = useState(routine?.weekday ?? 1);
  /* A toggle, not a two-option select. Publishing live is the consequential
     choice on this form and it deserves a control that looks like a decision,
     with what OFF means written next to it rather than left to be inferred. */
  const [autoPublish, setAutoPublish] = useState(routine?.hubStatus === "published");

  const spec = { kind, runAt, timeZone, weekday };
  const next = nextRunAt(spec);
  const scheduled = kind !== "manual";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-backdrop) bg-ink/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-(--z-modal) max-h-[92svh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-sunken p-5 shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none sm:p-7"
          aria-describedby={undefined}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <Dialog.Title className="font-heading text-[length:var(--text-h2)] font-bold tracking-tight text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors duration-(--duration-fast) hover:bg-deep hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <form action={action} className="space-y-5">
            {routine && <input type="hidden" name="id" value={routine.id} />}

            <Field label="Name" htmlFor="name">
              <input
                id="name"
                name="name"
                defaultValue={routine?.name ?? ""}
                placeholder="Weekly design systems"
                maxLength={80}
                className={FIELD}
              />
            </Field>

            {/* Above the schedule, because what a routine is for outranks what
                time it happens. */}
            <Field label="Description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                defaultValue={routine?.description ?? ""}
                placeholder="What this one is for — one line, shown on its card."
                maxLength={200}
                rows={3}
                className={`${FIELD} h-auto resize-y py-3 leading-relaxed`}
              />
            </Field>

            <Field label="Schedule" htmlFor="scheduleKind">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="scheduleKind"
                  name="scheduleKind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as RoutineScheduleKind)}
                  className={`${SELECT} sm:flex-1`}
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Once a week</option>
                  <option value="manual">Only when I press Run now</option>
                  {/* Not offered any more, but a routine already set to it keeps
                      it rather than being silently changed by opening its form. */}
                  {routine?.scheduleKind === "weekdays" && (
                    <option value="weekdays">Monday to Friday</option>
                  )}
                </select>

                {kind === "weekly" && (
                  <select
                    name="weekday"
                    aria-label="Day of the week"
                    value={weekday}
                    onChange={(event) => setWeekday(Number(event.target.value))}
                    className={`${SELECT} sm:flex-1`}
                  >
                    {WEEKDAY_NAMES.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {kind !== "weekly" && <input type="hidden" name="weekday" value={weekday} />}

                {scheduled && (
                  <input
                    type="time"
                    name="runAt"
                    aria-label="Time of day"
                    value={runAt}
                    onChange={(event) => setRunAt(event.target.value)}
                    className={`${FIELD} sm:w-40`}
                  />
                )}
                {!scheduled && <input type="hidden" name="runAt" value={runAt} />}
              </div>

              {/* What was just chosen, in words, and when it first happens —
                  computed with the same function the server stores
                  `next_run_at` with, so the sentence cannot drift from the
                  behaviour. Choosing a schedule IS switching it on; the card's
                  own switch is where a routine is paused later. */}
              <p className="pt-1 text-sm leading-relaxed text-ink-3">
                <span className="font-semibold text-ink-2">{describeSchedule(spec)}.</span>{" "}
                {next
                  ? `First run ${next.toLocaleString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone,
                    })}.`
                  : "It will not start on its own."}
              </p>
            </Field>

            <Plate>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-heading text-base font-bold text-ink">Publish automatically</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-2">
                    {autoPublish
                      ? "The article goes live on the Knowledge Hub with nobody reading it first."
                      : "The article waits in the Knowledge Hub as a draft for you to read and publish."}
                  </p>
                </div>
                <Switch
                  checked={autoPublish}
                  onChange={setAutoPublish}
                  label="Publish automatically"
                />
              </div>
              <input type="hidden" name="hubStatus" value={autoPublish ? "published" : "draft"} />
            </Plate>

            <Collapsible.Root className="rounded-2xl bg-surface">
              <Collapsible.Trigger className="group/adv flex w-full items-start justify-between gap-4 p-4 text-left outline-none focus-visible:shadow-[var(--shadow-focus)] focus-visible:rounded-2xl sm:p-5">
                <span className="min-w-0">
                  <span className="block font-heading text-base font-bold text-ink">
                    Advanced settings
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">
                    Which part of the territory it writes about, and the clock its schedule is read
                    on.
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) ease-(--ease-out) group-data-open/adv:rotate-180"
                />
              </Collapsible.Trigger>
              <Collapsible.Content className="overflow-hidden data-open:animate-in data-open:slide-in-from-top-1 data-closed:animate-out data-closed:slide-out-to-top-1 motion-reduce:animate-none">
                <div className="space-y-5 border-t border-line p-4 sm:p-5">
                  <Field label="Content direction" htmlFor="categoryId">
                    <select
                      id="categoryId"
                      name="categoryId"
                      defaultValue={routine?.categoryId ?? ""}
                      className={SELECT}
                    >
                      {/* Rotation is first because a schedule pinned to one
                          direction publishes the same corner of the territory
                          every time. */}
                      <option value="">Rotate through all of them</option>
                      {directions.map((direction) => (
                        <option key={direction.id} value={direction.id}>
                          {direction.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Time zone" htmlFor="timeZone">
                    <select
                      id="timeZone"
                      name="timeZone"
                      value={timeZone}
                      onChange={(event) => setTimeZone(event.target.value)}
                      className={SELECT}
                    >
                      {TIME_ZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <p className="text-sm leading-relaxed text-ink-3">
                      The clock the time above is read on, and the one the card counts down to.
                    </p>
                  </Field>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>

            <Footer submitLabel={submitLabel} onCancel={onCancel} />
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The wait belongs on the button that started it.
 *
 * `useFormStatus` reads the pending state of the form this sits inside, which
 * is the only way to know without threading a flag back down from the caller.
 * Cancel goes unavailable with it: half-saved is not a state anybody should be
 * offered a way out of.
 */
function Footer({ submitLabel, onCancel }: { submitLabel: string; onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
