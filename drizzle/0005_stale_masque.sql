ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_brand_profile_id_brand_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "brand_profile_id";
