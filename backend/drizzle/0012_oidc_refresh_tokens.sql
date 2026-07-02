ALTER TABLE "users" ADD COLUMN "oidc_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_token_expires_at" timestamp;
