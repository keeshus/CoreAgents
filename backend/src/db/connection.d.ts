import * as schema from './schema.js';
declare const pool: import("pg").Pool;
declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export { db, pool };
//# sourceMappingURL=connection.d.ts.map