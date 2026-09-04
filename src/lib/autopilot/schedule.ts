/**
 * When a routine next runs.
 *
 * A plain module — no `server-only`, no directive — because the same two
 * functions answer the question on the server (what to store in `next_run_at`)
 * and in the browser (what to show under the form while it is being filled in).
 *
 * NO DATE LIBRARY. `Intl.DateTimeFormat` already knows every zone the platform
 * knows, including its daylight-saving history, and the two helpers below are
 * the whole of what this feature needs from it.
 */

export type RoutineScheduleKind = "manual" | "daily" | "weekdays" | "weekly";

/** Sunday-first, matching `Date.prototype.getDay()`. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Zones offered in the form. Deliberately short: a list of six hundred is a
 * worse answer than a list of the places this team actually works from, and an
 * unlisted zone can be typed into the database if it ever comes up.
 */
export const TIME_ZONES = [
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

/** How far `at` is from UTC in the given zone, in milliseconds. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second")
  );
  return asIfUtc - at.getTime();
}

/** The instant at which a wall clock in `timeZone` reads the given date and time. */
function instantOf(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  /* Twice, because the offset depends on the instant and the instant depends on
     the offset. The first pass uses the offset at the wrong moment, which is off
     by an hour only across a daylight-saving boundary; the second uses the
     offset at very nearly the right one, which is correct on either side of it. */
  const first = naive - zoneOffsetMs(timeZone, new Date(naive));
  return new Date(naive - zoneOffsetMs(timeZone, new Date(first)));
}

/** The calendar date showing on a clock in `timeZone` at instant `at`. */
function dateIn(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** `HH:MM` as numbers, defaulting to 09:00 rather than throwing on nonsense. */
function readClock(runAt: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(runAt.trim());
  if (!match) return { hour: 9, minute: 0 };
  const hour = Math.min(Math.max(Number(match[1]), 0), 23);
  const minute = Math.min(Math.max(Number(match[2]), 0), 59);
  return { hour, minute };
}

export type ScheduleSpec = {
  kind: RoutineScheduleKind;
  /** `HH:MM` on a 24-hour clock, read in `timeZone`. */
  runAt: string;
  timeZone: string;
  /** 0–6, Sunday first. Only read when `kind` is `weekly`. */
  weekday: number;
};

/**
 * The next instant this schedule is due after `from`.
 *
 * Null for a manual routine, which is due when somebody presses the button and
 * at no other time.
 */
export function nextRunAt(spec: ScheduleSpec, from: Date = new Date()): Date | null {
  if (spec.kind === "manual") return null;
  const { hour, minute } = readClock(spec.runAt);
  const zone = spec.timeZone || "UTC";

  // Up to eight days ahead: enough to pass a whole week plus the day the search
  // starts on, so a weekly schedule always finds its day.
  for (let ahead = 0; ahead <= 8; ahead++) {
    const dayStart = new Date(from.getTime() + ahead * 24 * 60 * 60 * 1000);
    const { year, month, day } = dateIn(zone, dayStart);
    const candidate = instantOf(zone, year, month, day, hour, minute);
    if (candidate.getTime() <= from.getTime()) continue;

    // Which day of the week that instant lands on, read in the same zone.
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(
      candidate
    );
    const index = WEEKDAY_NAMES.indexOf(name as (typeof WEEKDAY_NAMES)[number]);
    if (spec.kind === "weekdays" && (index === 0 || index === 6)) continue;
    if (spec.kind === "weekly" && index !== spec.weekday) continue;
    return candidate;
  }
  return null;
}

/** One line a person can read, for the form and the routine card. */
export function describeSchedule(spec: ScheduleSpec): string {
  const { hour, minute } = readClock(spec.runAt);
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const zone = spec.timeZone || "UTC";
  switch (spec.kind) {
    case "manual":
      return "Only when you press Run now";
    case "daily":
      return `Every day at ${clock} (${zone})`;
    case "weekdays":
      return `Monday to Friday at ${clock} (${zone})`;
    case "weekly":
      return `Every ${WEEKDAY_NAMES[spec.weekday] ?? "Monday"} at ${clock} (${zone})`;
  }
}
