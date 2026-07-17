ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "profile_image_data" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "profile_image_mime" text DEFAULT '' NOT NULL;
