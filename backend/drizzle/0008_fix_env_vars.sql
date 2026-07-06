ALTER TABLE group_vault_config ALTER COLUMN vault_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE flows ADD COLUMN IF NOT EXISTS env_vars jsonb DEFAULT '[]';
