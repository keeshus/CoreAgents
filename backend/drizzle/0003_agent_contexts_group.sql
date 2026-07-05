ALTER TABLE "agent_contexts" ADD COLUMN "group_id" uuid REFERENCES "groups"("id");
