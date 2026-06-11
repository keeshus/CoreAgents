import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './connection.js';

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: 'backend/drizzle' });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
