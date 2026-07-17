DELETE FROM "api_keys" WHERE "provider" = 'anthropic';--> statement-breakpoint
DELETE FROM "api_keys"
WHERE "provider" = 'fal'
  AND "id" NOT IN (
    SELECT "id" FROM "api_keys"
    WHERE "provider" = 'fal'
    ORDER BY "created_at" ASC
    LIMIT 1
  );--> statement-breakpoint
UPDATE "api_keys" SET "label" = 'Fal.ai' WHERE "provider" = 'fal';
