CREATE TABLE IF NOT EXISTS "app_env_vars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "env_vars" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE group_vault_config ADD COLUMN IF NOT EXISTS env_vars jsonb DEFAULT '[]';
