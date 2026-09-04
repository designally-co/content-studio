-- A line saying what a routine is for.
--
-- The name alone stops being enough the moment there are several: "Weekly
-- brand" and "Weekly design" are distinguishable only to whoever typed them.
-- Optional, because a routine with an obvious name should not be forced to
-- restate it.
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "description" text;
