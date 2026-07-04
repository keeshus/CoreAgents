import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './connection.js';

async function main() {
  console.log('Running migrations...');
  console.log('Connecting to:', (process.env.DATABASE_URL || '').replace(/\/\/.*@/, '//***@'));

  // Test the connection before running migrations
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('PostgreSQL version:', result.rows[0].version.split(',')[0]);
    client.release();
  } catch (err: any) {
    console.error('\n❌ Cannot connect to PostgreSQL.');
    console.error(`   URL: ${(process.env.DATABASE_URL || '').replace(/\/\/.*@/, '//***@')}`);
    console.error(`   Error: ${err.message}`);
    console.error('');
    if (err.message?.includes('ECONNREFUSED')) {
      console.error('   → PostgreSQL is not running. Start it with:');
      console.error('     docker compose up -d postgres');
    } else if (err.message?.includes('does not exist')) {
      console.error('   → Database does not exist. Create it with:');
      console.error('     createdb coreagents');
    } else if (err.message?.includes('role') || err.message?.includes('password')) {
      console.error('   → Wrong credentials. Check your .env file.');
    } else {
      console.error('   → Check your .env file and ensure PostgreSQL is accessible.');
    }
    process.exit(1);
  }

  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
