-- Migration 0015: Create any tables defined in schema.ts that are missing
-- from earlier migration SQL files. Uses IF NOT EXISTS so it's safe to
-- run on any database regardless of which migrations have been applied.

CREATE TABLE IF NOT EXISTS "execution_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL,
  "node_id" text NOT NULL,
  "node_type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "collection_name" text NOT NULL,
  "embedding_provider_id" uuid,
  "vector_store_id" uuid,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL,
  "nodes" jsonb NOT NULL,
  "edges" jsonb NOT NULL,
  "version" integer NOT NULL,
  "group_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
