ALTER TABLE "embeddings" ALTER COLUMN "embedding" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "embedding" SET DEFAULT '[]';