CREATE TABLE IF NOT EXISTS "chat_api_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model_name" text NOT NULL,
	"rate_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"label" text DEFAULT 'Default' NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "chat_api_deployments" ADD CONSTRAINT "chat_api_deployments_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_api_deployments" ADD CONSTRAINT "chat_api_deployments_flow_id_unique" UNIQUE("flow_id");--> statement-breakpoint
ALTER TABLE "chat_api_keys" ADD CONSTRAINT "chat_api_keys_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_api_keys" ADD CONSTRAINT "chat_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
