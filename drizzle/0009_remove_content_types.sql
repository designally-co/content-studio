INSERT INTO "app_settings" ("key", "value")
SELECT 'article.prompt', "format_rules_json"->>'prompt'
FROM "content_types"
WHERE lower("name") LIKE '%article%'
  AND coalesce("format_rules_json"->>'prompt', '') <> ''
ORDER BY CASE WHEN lower("name") = 'article' THEN 0 ELSE 1 END
LIMIT 1
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_content_type_id_content_types_id_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "content_type_id";--> statement-breakpoint
DROP TABLE "content_types";
