-- Autopilot: a schedule that writes and publishes an article without an editor.
--
-- Two tables because a schedule and a run of it are different things with
-- different lifetimes. The schedule is configuration a person edits; a run is
-- a record of what the machine did, which has to survive the schedule being
-- changed or switched off — otherwise "what published this?" has no answer.
--
-- `routine_runs.step` is the state machine. A full article takes minutes and a
-- serverless function gets 60 seconds, so a run advances ONE step per request
-- and its position is stored here rather than held in memory. That is also what
-- makes a crashed run resumable instead of lost.
--
-- `locked_until` is the concurrency guard. Two pokes arriving together must not
-- both advance the same run; a claim sets this forward and no other worker can
-- take the row until it expires, which also means a worker that dies mid-step
-- releases the run by itself rather than wedging it.

CREATE TABLE IF NOT EXISTS "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Autopilot' NOT NULL,
	-- Off. An automation that publishes to a live site does not arrive switched on.
	"enabled" boolean DEFAULT false NOT NULL,
	-- Null means rotate through every active direction rather than repeat one.
	"category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
	-- What the article becomes in the Hub. 'draft' keeps a human gate at the far
	-- end even when everything before it is automatic.
	"hub_status" text DEFAULT 'draft' NOT NULL,
	"images_per_run" integer DEFAULT 1 NOT NULL,
	-- A ceiling a bug cannot spend past.
	"max_per_day" integer DEFAULT 1 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "routine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL REFERENCES "routines"("id") ON DELETE CASCADE,
	-- Set null rather than cascade: deleting the article should not erase the
	-- record that the machine made one.
	"project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
	"step" text DEFAULT 'topic' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- The runner's two questions: what is still running, and how many ran today.
CREATE INDEX IF NOT EXISTS "routine_runs_status_idx" ON "routine_runs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routine_runs_routine_started_idx" ON "routine_runs" ("routine_id", "started_at");
