"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TIME_ZONES,
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
}: {
  routine?: RoutineView;
  directions: { id: string; name: string }[];
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<RoutineScheduleKind>(routine?.scheduleKind ?? "daily");
  const [runAt, setRunAt] = useState(routine?.runAt ?? "09:00");
  const [timeZone, setTimeZone] = useState(routine?.timeZone ?? "Asia/Bangkok");
  const [weekday, setWeekday] = useState(routine?.weekday ?? 1);

  const spec = { kind, runAt, timeZone, weekday };
  const next = nextRunAt(spec);

  return (
    <form action={action} className="space-y-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {routine && <input type="hidden" name="id" value={routine.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={routine?.name ?? ""}
            placeholder="Daily explainer"
            maxLength={80}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduleKind">When it runs</Label>
          <select
            id="scheduleKind"
            name="scheduleKind"
            value={kind}
            onChange={(event) => setKind(event.target.value as RoutineScheduleKind)}
            className={FIELD}
          >
            <option value="manual">Only when I press Run now</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Monday to Friday</option>
            <option value="weekly">Once a week</option>
          </select>
        </div>

        {kind === "weekly" && (
          <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="runAt">Time</Label>
              <Input
                id="runAt"
                name="runAt"
                type="time"
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeZone">Time zone</Label>
              <select
                id="timeZone"
                name="timeZone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                className={FIELD}
              >
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {kind === "manual" && (
          <>
            <input type="hidden" name="runAt" value={runAt} />
            <input type="hidden" name="timeZone" value={timeZone} />
          </>
        )}

        <div className="space-y-2">
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

        <div className="space-y-2">
          <Label htmlFor="hubStatus">What it creates in the Hub</Label>
          <select
            id="hubStatus"
            name="hubStatus"
            defaultValue={routine?.hubStatus ?? "draft"}
            className={FIELD}
          >
            <option value="draft">A draft — somebody publishes it</option>
            <option value="published">Published — live immediately</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxPerDay">Articles per day</Label>
          <Input
            id="maxPerDay"
            name="maxPerDay"
            type="number"
            min={1}
            max={5}
            defaultValue={routine?.maxPerDay ?? 1}
          />
          <p className="text-sm leading-relaxed text-ink-2">
            A ceiling a mistake cannot spend past. Capped at five whatever is typed here, and
            ignored when you press Run now.
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
            defaultValue={routine?.imagesPerRun ?? 1}
          />
          <p className="text-sm leading-relaxed text-ink-2">
            Zero writes the article without a cover, and skips three of the seven steps.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-sunken p-4">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={routine?.enabled ?? false}
          className="mt-0.5 size-5 shrink-0 rounded-md border-line-strong accent-[var(--orange-500)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">Run on this schedule</span>
          <span className="mt-1 block text-sm leading-relaxed text-ink-2">
            While this is on, articles are written and sent without anyone approving them. Off, the
            routine still runs when you press Run now.
          </span>
        </span>
      </label>

      <p className="rounded-2xl bg-accent-soft px-5 py-4 text-sm leading-relaxed text-ink-2">
        <strong className="font-semibold text-ink">{describeSchedule(spec)}.</strong>{" "}
        {next
          ? `Next: ${next.toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })} in your own time zone.`
          : "It will not start on its own."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">{routine ? "Save changes" : "Create routine"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
