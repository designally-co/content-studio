-- Which day a monthly routine runs on.
--
-- Read only when schedule_kind is 'monthly', the way weekday is read only by a
-- weekly one. Existing rows get 1, which no existing routine consults.
--
-- 1 to 31, and a value past the end of a short month is clamped to its last
-- day rather than skipping the month -- see nextRunAt in
-- src/lib/autopilot/schedule.ts, which is where that decision is enforced.
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "day_of_month" integer DEFAULT 1 NOT NULL;
