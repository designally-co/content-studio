CREATE TABLE "api_keys" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
