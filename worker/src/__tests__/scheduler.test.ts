import { describe, it, expect } from 'vitest';

/**
 * Cron matching helpers that mirror the logic in scheduler.ts.
 * Format: "minute hour day-of-month month day-of-week"
 * All values are 0-indexed except day-of-week (0=Sunday).
 */

function fieldMatches(pattern: string, value: number): boolean {
  if (pattern === '*') return true;

  // Step values: */5 or 1-5/2
  const stepMatch = pattern.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
  if (stepMatch) {
    const range = stepMatch[1];
    const step = parseInt(stepMatch[2]);
    if (step === 0) return false;
    if (range === '*') return value % step === 0;
    const [lo, hi] = range.split('-').map(Number);
    return value >= (lo || 0) && value <= (hi || 59) && (value - (lo || 0)) % step === 0;
  }

  // Comma-separated values
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => fieldMatches(p.trim(), value));
  }

  // Range: 1-5
  if (pattern.includes('-')) {
    const [lo, hi] = pattern.split('-').map(Number);
    return value >= lo && value <= hi;
  }

  // Exact value
  return parseInt(pattern) === value;
}

function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, month, dow] = parts;
  const values = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dom: date.getDate(),
    month: date.getMonth() + 1,
    dow: date.getDay(),
  };

  const fields: Array<{ pattern: string; value: number }> = [
    { pattern: min, value: values.minute },
    { pattern: hour, value: values.hour },
    { pattern: dom, value: values.dom },
    { pattern: month, value: values.month },
    { pattern: dow, value: values.dow },
  ];

  for (const { pattern, value } of fields) {
    if (!fieldMatches(pattern, value)) return false;
  }
  return true;
}

describe('cronMatches', () => {
  it('`* * * * *` matches every minute', () => {
    const date = new Date('2026-06-15T14:35:00Z');
    expect(cronMatches('* * * * *', date)).toBe(true);
  });

  it('`0 * * * *` matches at the start of each hour', () => {
    // minute 0 should match
    expect(cronMatches('0 * * * *', new Date('2026-06-15T14:00:00Z'))).toBe(true);
    // any other minute should not match
    expect(cronMatches('0 * * * *', new Date('2026-06-15T14:01:00Z'))).toBe(false);
    expect(cronMatches('0 * * * *', new Date('2026-06-15T14:30:00Z'))).toBe(false);
  });

  it('`*/5 * * * *` matches every 5 minutes', () => {
    for (const minute of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) {
      expect(cronMatches('*/5 * * * *', new Date(`2026-06-15T14:${String(minute).padStart(2, '0')}:00Z`))).toBe(true);
    }
    for (const minute of [1, 2, 3, 4, 6, 7, 8, 9, 11]) {
      expect(cronMatches('*/5 * * * *', new Date(`2026-06-15T14:${String(minute).padStart(2, '0')}:00Z`))).toBe(false);
    }
  });

  it('`1-10 * * * *` matches minutes 1-10', () => {
    for (let m = 1; m <= 10; m++) {
      expect(cronMatches('1-10 * * * *', new Date(`2026-06-15T14:${String(m).padStart(2, '0')}:00Z`))).toBe(true);
    }
    expect(cronMatches('1-10 * * * *', new Date('2026-06-15T14:00:00Z'))).toBe(false);
    expect(cronMatches('1-10 * * * *', new Date('2026-06-15T14:11:00Z'))).toBe(false);
  });

  it('`0 9 * * 1-5` matches 9am on weekdays (Mon-Fri)', () => {
    // Use local date constructor so getDay() matches correctly regardless of timezone
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 5, 15, 9, 0, 0))).toBe(true);   // Mon
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 5, 16, 9, 0, 0))).toBe(true);   // Tue
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 5, 20, 9, 0, 0))).toBe(false);  // Sat
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 5, 15, 10, 0, 0))).toBe(false); // Mon 10am
  });

  it('`0,15,30,45 * * * *` matches every quarter hour', () => {
    for (const minute of [0, 15, 30, 45]) {
      expect(cronMatches('0,15,30,45 * * * *', new Date(`2026-06-15T14:${String(minute).padStart(2, '0')}:00Z`))).toBe(true);
    }
    expect(cronMatches('0,15,30,45 * * * *', new Date('2026-06-15T14:07:00Z'))).toBe(false);
    expect(cronMatches('0,15,30,45 * * * *', new Date('2026-06-15T14:22:00Z'))).toBe(false);
  });

  it('returns false for invalid expressions', () => {
    const date = new Date('2026-06-15T14:00:00Z');

    // Too few parts
    expect(cronMatches('* * * *', date)).toBe(false);

    // Too many parts
    expect(cronMatches('* * * * * *', date)).toBe(false);

    // Empty string
    expect(cronMatches('', date)).toBe(false);

    // Nonsense pattern
    expect(cronMatches('foo bar baz qux quux', date)).toBe(false);
  });
});

describe('fieldMatches', () => {
  it('handles wildcard', () => {
    expect(fieldMatches('*', 5)).toBe(true);
    expect(fieldMatches('*', 0)).toBe(true);
    expect(fieldMatches('*', 59)).toBe(true);
  });

  it('handles exact value', () => {
    expect(fieldMatches('5', 5)).toBe(true);
    expect(fieldMatches('5', 4)).toBe(false);
    expect(fieldMatches('0', 0)).toBe(true);
  });

  it('handles range', () => {
    expect(fieldMatches('1-5', 3)).toBe(true);
    expect(fieldMatches('1-5', 1)).toBe(true);
    expect(fieldMatches('1-5', 5)).toBe(true);
    expect(fieldMatches('1-5', 0)).toBe(false);
    expect(fieldMatches('1-5', 6)).toBe(false);
  });

  it('handles step on wildcard', () => {
    expect(fieldMatches('*/5', 0)).toBe(true);
    expect(fieldMatches('*/5', 5)).toBe(true);
    expect(fieldMatches('*/5', 10)).toBe(true);
    expect(fieldMatches('*/5', 3)).toBe(false);
    expect(fieldMatches('*/5', 7)).toBe(false);
  });

  it('handles step on range', () => {
    expect(fieldMatches('1-10/3', 1)).toBe(true);   // 1
    expect(fieldMatches('1-10/3', 4)).toBe(true);   // 1+3
    expect(fieldMatches('1-10/3', 7)).toBe(true);   // 1+6
    expect(fieldMatches('1-10/3', 10)).toBe(true);  // 1+9
    expect(fieldMatches('1-10/3', 2)).toBe(false);
    expect(fieldMatches('1-10/3', 5)).toBe(false);
  });

  it('handles comma-separated values', () => {
    expect(fieldMatches('1,3,5', 1)).toBe(true);
    expect(fieldMatches('1,3,5', 3)).toBe(true);
    expect(fieldMatches('1,3,5', 5)).toBe(true);
    expect(fieldMatches('1,3,5', 2)).toBe(false);
    expect(fieldMatches('1,3,5', 4)).toBe(false);
  });

  it('handles comma-separated ranges', () => {
    expect(fieldMatches('1-3,7-9', 2)).toBe(true);
    expect(fieldMatches('1-3,7-9', 8)).toBe(true);
    expect(fieldMatches('1-3,7-9', 5)).toBe(false);
  });
});
