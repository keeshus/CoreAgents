import pino from 'pino';

// Structured logger that writes to stdout + PostgreSQL
// Level: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: undefined, // use default stdout
  formatters: {
    level(label) { return { level: label }; },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Async logger that persists to the logs table in PostgreSQL
// For high-volume events, prefer stdout-only via logger.info/warn/error
export async function logToDb(
  level: 'info' | 'warn' | 'error',
  component: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const { db } = await import('../db/connection.js');
    const { logs } = await import('../db/schema.js');
    await db.insert(logs).values({ level, component, message, metadata: metadata ?? {} });
  } catch {
    // Don't let logging failures crash the app
  }
}
