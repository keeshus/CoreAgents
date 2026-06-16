import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from '../utils/async-handler.js';

describe('asyncHandler', () => {
  // ── Error handling ─────────────────────────────────────────

  it('catches async errors and passes them to next', async () => {
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    const testError = new Error('async error');

    const handler = asyncHandler(async () => {
      throw testError;
    });

    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(testError);
  });

  it('passes rejected promises to next', async () => {
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    const testError = new Error('rejected promise');

    const handler = asyncHandler(async () => {
      throw testError;
    });

    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(testError);
  });

  // ── Successful execution ───────────────────────────────────

  it('passes successful async requests through without calling next with error', async () => {
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    const handlerBody = vi.fn();

    const handler = asyncHandler(async () => {
      handlerBody();
    });

    await handler(req, res, next);

    expect(handlerBody).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards req, res, and next to the wrapped handler', async () => {
    const req = { method: 'GET', url: '/test' } as any;
    const res = { statusCode: 200, json: vi.fn() } as any;
    const next = vi.fn();
    const handlerBody = vi.fn();

    const handler = asyncHandler(async (r, s, n) => {
      handlerBody(r, s, n);
    });

    await handler(req, res, next);

    expect(handlerBody).toHaveBeenCalledWith(req, res, next);
  });

  it('returns a function that can be used as an Express route handler', () => {
    const handler = asyncHandler(async () => {
      // no-op
    });

    expect(handler).toBeInstanceOf(Function);
    expect(handler.length).toBe(3); // (req, res, next)
  });

  // ── Non-async (synchronous) handlers ───────────────────────

  it('works with non-async handlers that return void', () => {
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    const handlerBody = vi.fn();

    const handler = asyncHandler(() => {
      handlerBody();
    });

    handler(req, res, next);

    expect(handlerBody).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT catch synchronous throws (sync errors must be handled by the handler itself)', () => {
    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();
    const testError = new Error('sync throw');

    const handler = asyncHandler(() => {
      throw testError;
    });

    expect(() => {
      handler(req, res, next);
    }).toThrow(testError);

    // next should NOT have been called because Promise.resolve doesn't
    // catch sync throws (only async / returned-promise rejections)
    expect(next).not.toHaveBeenCalled();
  });
});
