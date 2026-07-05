ALTER TABLE "secrets" ALTER COLUMN "encrypted_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ALTER COLUMN "encryption_iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ALTER COLUMN "encryption_tag" DROP NOT NULL;
