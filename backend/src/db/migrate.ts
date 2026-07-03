import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { execSync } from 'node:child_process';
import { db, pool } from './connection.js';

async function ensurePostgres() {
  try {
    // Quick connection test
    const client = await pool.connect();
    client.release();
    return;
  } catch {
    console.log('PostgreSQL not reachable. Attempting to start via Docker...');
  }

  try {
    execSync('docker compose up -d postgres --wait', {
      cwd: new URL('../..', import.meta.url).pathname,
      stdio: 'inherit',
      timeout: 120000,
    });
    console.log('PostgreSQL started via Docker.');
  } catch (e) {
    console.error(`
PostgreSQL is required. Start it manually:

  1. Using Docker:   docker compose up -d postgres
  2. Or provide a DATABASE_URL in .env pointing to your PostgreSQL instance.

The default credentials are:
  DATABASE_URL=postgres://coreagents:coreagents@localhost:5432/coreagents

Create the database if needed:
  createdb coreagents
`);
    process.exit(1);
  }
}

async function main() {
  await ensurePostgres();

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
