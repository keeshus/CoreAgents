ALTER TABLE "secrets" ADD COLUMN "secret_type" text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "reference_path" text;
