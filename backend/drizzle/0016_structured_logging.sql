CREATE TABLE IF NOT EXISTS "logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "level" text DEFAULT 'info' NOT NULL,
  "component" text DEFAULT 'app' NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);
