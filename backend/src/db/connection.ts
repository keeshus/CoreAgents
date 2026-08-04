import { getDb } from "orchestream-ai-shared";

const { db, pool } = getDb();

export { db, pool };
