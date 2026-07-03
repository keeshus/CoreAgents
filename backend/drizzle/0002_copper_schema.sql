-- Create executions table if it doesn't exist (needed before ALTER below)
CREATE TABLE IF NOT EXISTS "executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "input" jsonb DEFAULT '{}' NOT NULL,
  "output" jsonb DEFAULT '{}',
  "error" text,
  "pending_hitls" jsonb DEFAULT '[]',
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add awaiting_approval to execution_status enum
ALTER TYPE "execution_status" ADD VALUE IF NOT EXISTS 'awaiting_approval';
--> statement-breakpoint
-- Add pending_hitls JSONB column to executions table
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "pending_hitls" jsonb DEFAULT '[]'::jsonb;
