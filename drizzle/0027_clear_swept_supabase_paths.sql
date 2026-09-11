-- Swept reference photographs point at nothing, and now say so.
--
-- A swept reference keeps its row -- for the licence and attribution it
-- records -- but its file was deleted when its article was published. Its
-- storage_path still named that file in Supabase Storage, which stopped holding
-- anything on 11 September 2026, when every live image moved to Cloudflare R2
-- and the bucket was emptied. These paths were the last mention of Supabase
-- Storage in the database, and each described a file that exists nowhere.
--
-- 'swept:' states exactly that: a row whose bytes are gone on purpose. The app
-- treats any path that is neither an R2 URL nor local: as "no file", so this
-- changes nothing a reader or an editor sees. storage_path is NOT NULL, which is
-- why this is a marker and not a null.
--
-- Scoped to swept rows only. Every unswept reference and every image already
-- carries an R2 URL; this touches nothing that has a file.
UPDATE "image_references"
   SET "storage_path" = 'swept:'
 WHERE "swept_at" IS NOT NULL
   AND "storage_path" LIKE 'supabase:%';
