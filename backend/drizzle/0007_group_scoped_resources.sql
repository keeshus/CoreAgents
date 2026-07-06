ALTER TABLE llm_endpoints ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE embedding_providers ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE vector_stores ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
