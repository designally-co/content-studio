-- Routines become many, and carry their own schedule.
--
-- The first version was one hidden row in Settings with no schedule of its own:
-- an external timer decided WHEN, and the row only said what. That put half the
-- feature in a GitHub workflow file, where nobody editing content can see it or
-- change it, and made "two routines, different days" impossible to express.
--
-- Now the timer only says "tick". Everything about when — the days, the hour,
-- the zone it is read in — is here, editable in the app, one row per routine.
--
-- `next_run_at` is the whole scheduling index: a tick asks for enabled routines
-- whose next run is in the past, starts them, and computes the following one.
-- Storing the ANSWER rather than recomputing every schedule on every tick also
-- means a routine that was switched off and back on does not fire for the runs
-- it slept through.

ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "schedule_kind" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "run_at" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "time_zone" text DEFAULT 'Asia/Bangkok' NOT NULL;--> statement-breakpoint
-- 0–6, Sunday first, read only by a weekly schedule.
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "weekday" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "routines_due_idx" ON "routines" ("enabled", "next_run_at");--> statement-breakpoint

-- The runs of a routine, listed newest first on its card.
CREATE INDEX IF NOT EXISTS "routine_runs_routine_idx" ON "routine_runs" ("routine_id", "started_at");

-- The routine that already exists was made by the version with no schedule of
-- its own: an external timer fired every few minutes and the daily limit
-- decided the rest, which is a daily schedule with the hour left to chance.
-- Say so, and let it keep running rather than going quiet on deploy.
UPDATE "routines" SET "schedule_kind" = 'daily', "next_run_at" = now()
WHERE "enabled" = true AND "schedule_kind" = 'manual';
