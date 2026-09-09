-- What started a run: the schedule, or a person pressing Run now.
--
-- The daily ceiling counts scheduled runs only, and until now it could not tell
-- the two apart -- so testing a routine by hand at eleven silently disqualified
-- its own half-past-twelve schedule, with nothing on screen to say so.
--
-- Existing rows become 'schedule'. That is right for every run a tick started
-- and wrong for the handful somebody pressed, which is a distinction nothing
-- recorded at the time; it decays within a day, since the ceiling only ever
-- looks at rows from today.
ALTER TABLE "routine_runs" ADD COLUMN IF NOT EXISTS "trigger" text DEFAULT 'schedule' NOT NULL;--> statement-breakpoint

-- The ceiling reads (routine, day, trigger), and it reads it on every tick.
CREATE INDEX IF NOT EXISTS "routine_runs_routine_started_idx"
  ON "routine_runs" ("routine_id", "started_at");
