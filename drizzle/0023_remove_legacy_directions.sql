-- Remove the eight content directions left over from the taxonomy that came
-- before the four Content Core Pillars. Every one of them is inactive, belongs
-- to no pillar, and is not offered anywhere: not on Create, and not in Settings,
-- which stopped listing pillar-less directions.
--
-- GUARDED, NOT ASSUMED. `projects.category_id` references `categories.id` with
-- no ON DELETE clause, so Postgres refuses to delete a direction any article is
-- still filed under — and that refusal would abort this migration and fail the
-- deploy that runs it. `routines.category_id` is ON DELETE SET NULL, which is
-- worse in its way: it would succeed, and quietly strip the direction from a
-- routine that is still generating articles with it.
--
-- So each row must prove it is unused before it goes. A direction still
-- attached to an article or a routine is not legacy in practice, whatever its
-- name says, and it survives here rather than taking something with it. On the
-- database this was written against, all eight are unreferenced.
--
-- The pillar and active checks are belt and braces: the names alone would be
-- enough, but a direction that had since been given a pillar or switched back
-- on would be in use again, and this should not be the thing that removes it.
DELETE FROM "categories" AS c
WHERE c."name" IN (
    'AI Tools for Designers',
    'Branding & Identity',
    'Creative Industry & Trends',
    'Creative Resources',
    'Design Principles',
    'Typography & Fonts',
    'UX/UI Resources',
    'Web Design & Creative Technology'
  )
  AND c."active" = false
  AND c."pillar_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "projects" p WHERE p."category_id" = c."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "routines" r WHERE r."category_id" = c."id"
  );
