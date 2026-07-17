DELETE FROM "api_keys"
WHERE "provider" IN ('openai', 'google', 'huggingface');--> statement-breakpoint
DELETE FROM "pricing"
WHERE "provider" IN ('openai', 'google', 'huggingface');--> statement-breakpoint
UPDATE "projects"
SET "inputs_json" = "inputs_json" - 'imageProvider' - 'imageApiKeyId'
WHERE "inputs_json"->>'imageProvider' LIKE 'openai:%'
   OR "inputs_json"->>'imageProvider' LIKE 'google:%'
   OR "inputs_json"->>'imageProvider' LIKE 'huggingface:%';--> statement-breakpoint
INSERT INTO "pricing" ("provider", "model", "unit", "price_usd")
SELECT 'fal', 'fal-ai/bytedance/seedream/v5/lite/text-to-image', 'image', '0.035'
WHERE NOT EXISTS (
  SELECT 1 FROM "pricing"
  WHERE "provider" = 'fal'
    AND "model" = 'fal-ai/bytedance/seedream/v5/lite/text-to-image'
    AND "unit" = 'image'
);--> statement-breakpoint
INSERT INTO "pricing" ("provider", "model", "unit", "price_usd")
SELECT 'fal', 'fal-ai/bytedance/seedream/v5/lite/edit', 'image', '0.035'
WHERE NOT EXISTS (
  SELECT 1 FROM "pricing"
  WHERE "provider" = 'fal'
    AND "model" = 'fal-ai/bytedance/seedream/v5/lite/edit'
    AND "unit" = 'image'
);
