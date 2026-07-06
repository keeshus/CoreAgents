import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: InstanceType<typeof Pool> | null = null;

export function createDb(connectionString?: string) {
  const pool = new Pool({
    connectionString: connectionString || process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export function getDb(connectionString?: string) {
  if (!_db) {
    const created = createDb(connectionString);
    _db = created.db;
    _pool = created.pool;
  }
  return { db: _db, pool: _pool! };
}
