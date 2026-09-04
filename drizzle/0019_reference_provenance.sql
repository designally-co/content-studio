-- Where a reference image came from, recorded on the row.
--
-- References used to arrive one way: a person chose a file and uploaded it, so
-- provenance lived in whoever remembered doing it. They can now also be found
-- automatically — the lead image of a source the article already cites, or an
-- openly licensed image matched to the brief — and those two need an answer to
-- "where is this from, and what may we do with it" that survives the session
-- that fetched them.
--
-- `origin` is the channel. `source_url` is the page it was taken from, never
-- the image file: the page is what a person can open to check. `license` and
-- `attribution` are filled where the channel states them (the open-licence
-- pool does; a publisher's own page does not, which is itself the useful
-- signal — a null licence is an image nobody has cleared).
--
-- Existing rows are uploads by definition, which is why the default is
-- 'upload' and no backfill is needed.
--
-- Hand-written, like 0016 and 0017. drizzle-kit's last snapshot is 0018, so a
-- future `db:generate` will re-emit these columns; trim them as 0018's own
-- comment describes.

ALTER TABLE "image_references" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_references" ADD COLUMN IF NOT EXISTS "source_url" text;--> statement-breakpoint
ALTER TABLE "image_references" ADD COLUMN IF NOT EXISTS "source_name" text;--> statement-breakpoint
ALTER TABLE "image_references" ADD COLUMN IF NOT EXISTS "license" text;--> statement-breakpoint
ALTER TABLE "image_references" ADD COLUMN IF NOT EXISTS "attribution" text;
