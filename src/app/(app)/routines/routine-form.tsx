"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEEKDAY_NAMES,
  describeSchedule,
  nextRunAt,
  type RoutineScheduleKind,
} from "@/lib/autopilot/schedule";
import type { RoutineView } from "@/lib/autopilot/views";

const FIELD =
  "h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";

/**
 * One routine's settings.
 *
 * The same form creates and edits — the only difference is a hidden id and
 * which action it posts to — because two forms that must stay identical
 * eventually stop being identical.
 *
 * The schedule sentence under the fields is computed here, from the same
 * function the server stores `next_run_at` with. It is the difference between
 * choosing "weekly, Monday, 09:00, Asia/Bangkok" and knowing what that means.
 */
export function RoutineForm({
  routine,
  directions,
  action,
  onCancel,
  submitLabel,
}: {
  routine?: RoutineView;
  directions: { id: string; name: string }[];
  action: (formData: FormData) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [kind, setKind] = useState<RoutineScheduleKind>(routine?.scheduleKind ?? "daily");
  const [runAt, setRunAt] = useState(routine?.runAt ?? "09:00");
  const timeZone = routine?.timeZone ?? "Asia/Bangkok";
  const [weekday, setWeekday] = useState(routine?.weekday ?? 1);

  const spec = { kind, runAt, timeZone, weekday };
  const next = nextRunAt(spec);

  return (
    <form action={action} className="space-y-6">
      {routine && <input type="hidden" name="id" value={routine.id} />}

      <div className="grid gap-5 sm:grid-cols-6">
        <div className="space-y-2 sm:col-span-6">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={routine?.name ?? ""}
            placeholder="Daily explainer"
            maxLength={80}
          />
        </div>

        <div className={`space-y-2 ${kind === "manual" ? "sm:col-span-6" : kind === "weekly" ? "sm:col-span-2" : "sm:col-span-3"}`}>
          <Label htmlFor="scheduleKind">When it runs</Label>
          <select
            id="scheduleKind"
            name="scheduleKind"
            value={kind}
            onChange={(event) => setKind(event.target.value as RoutineScheduleKind)}
            className={FIELD}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Once a week</option>
            <option value="manual">Only when I press Run now</option>
            {/* Not offered any more, but a routine already set to it keeps it
                rather than being silently changed by opening its form. */}
            {routine?.scheduleKind === "weekdays" && (
              <option value="weekdays">Monday to Friday</option>
            )}
          </select>
        </div>

        {kind === "weekly" && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="weekday">Day</Label>
            <select
              id="weekday"
              name="weekday"
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
              className={FIELD}
            >
              {WEEKDAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind !== "weekly" && <input type="hidden" name="weekday" value={weekday} />}

        {kind !== "manual" && (
          <>
            <div className={`space-y-2 ${kind === "weekly" ? "sm:col-span-2" : "sm:col-span-3"}`}>
              <Label htmlFor="runAt">Time</Label>
              <Input
                id="runAt"
                name="runAt"
                type="time"
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
              />
              <p className="text-sm text-ink-2">{timeZone.replace(/_/g, " ")} time.</p>
            </div>
          </>
        )}
        <input type="hidden" name="runAt" value={runAt} />
        {/* One zone, not a picker: everyone who edits these sits in the same
            place, and a per-routine zone is a field to get wrong every time for
            a case that has not come up. The column stays, so it can come back. */}
        <input type="hidden" name="timeZone" value={timeZone} />

        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="categoryId">Content direction</Label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={routine?.categoryId ?? ""}
            className={FIELD}
          >
            {/* Rotation is first because a schedule pinned to one direction
                publishes the same corner of the territory every time. */}
            <option value="">Rotate through all of them</option>
            {directions.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="hubStatus">When the article is finished</Label>
          <select
            id="hubStatus"
            name="hubStatus"
            defaultValue={routine?.hubStatus ?? "draft"}
            className={FIELD}
          >
            <option value="draft">Save it as a draft</option>
            <option value="published">Publish it live</option>
          </select>
          <p className="text-sm leading-relaxed text-ink-2">
            A draft keeps one human check at the far end. Publishing live skips it — the article is
            on the site before anyone has read it.
          </p>
        </div>

      </div>

      {/* The one thing the form has to say back: what was just chosen, in words,
          and when it first happens. Choosing a schedule IS switching it on —
          there is no second confirmation, and the row's own switch is where a
          routine is paused later. */}
      <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-ink-2">
        <strong className="font-semibold text-ink">{describeSchedule(spec)}.</strong>{" "}
        {next ? (
          <>
            {`Next: ${next.toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })} in your own time zone.`}{" "}
            {!routine && "It starts running as soon as you create it, and writes without anyone approving it."}
          </>
        ) : (
          "It will not start on its own — press Run now when you want an article."
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">{submitLabel}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
