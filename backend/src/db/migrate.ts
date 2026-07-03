import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { execSync } from 'node:child_process';
import { db, pool } from './connection.js';

async function main() {
  // Push the schema to ensure all tables exist. Some tables (e.g. executions) are
  // defined in schema.ts but not in any migration SQL file — they need to exist
  // before migration SQL that ALTERs them can run.
  console.log('Syncing schema...');
  execSync('npx --yes drizzle-kit push --config drizzle.config.ts --force', {
    cwd: new URL('../..', import.meta.url).pathname,
    stdio: 'inherit',
  });

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
