CREATE TABLE IF NOT EXISTS "api_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"path_slug" text NOT NULL,
	"rate_limit" integer DEFAULT 0 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_deployments_flow_id_unique" UNIQUE("flow_id"),
	CONSTRAINT "api_deployments_path_slug_unique" UNIQUE("path_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_deployments" ADD CONSTRAINT "api_deployments_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_flow_user_idx" ON "api_keys" USING btree ("flow_id","user_id");