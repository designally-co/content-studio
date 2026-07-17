ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "logo_data" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "logo_mime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "logo_overlay_json" jsonb DEFAULT '{"position":"bottom-right","sizePct":15,"opacity":1,"shadow":true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "branding_json" jsonb;
