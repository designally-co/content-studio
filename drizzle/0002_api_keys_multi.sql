ALTER TABLE "api_keys" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "label" text DEFAULT 'API Key' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_pkey";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY("id");--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "updated_at";
