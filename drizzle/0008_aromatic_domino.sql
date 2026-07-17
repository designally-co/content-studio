CREATE TABLE "image_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "aspect_ratio" text DEFAULT '1:1' NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "variation_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "reference_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "image_references" ADD CONSTRAINT "image_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;