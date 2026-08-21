ALTER TABLE "api_usage_log" ADD COLUMN IF NOT EXISTS "cache_creation_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD COLUMN IF NOT EXISTS "prompt_version" text;--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD COLUMN IF NOT EXISTS "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD COLUMN IF NOT EXISTS "schema_retry_count" integer DEFAULT 0 NOT NULL;
