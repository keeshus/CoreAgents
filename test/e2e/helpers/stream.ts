import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

/**
 * Execute a flow in debug mode and read all SSE events.
 * Uses native fetch. Pass cookies from the auth state explicitly.
 */
export async function debugExecute(
  flowId: string,
  input: Record<string, unknown>,
  cookieHeader?: string,
  abortSignal?: AbortSignal,
): Promise<SSEEvent[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, _debug: true }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.status}`);
  return readSSE(res, abortSignal);
}

/**
 * Read SSE events from a streaming response, optionally with early cancellation.
 */
export async function readSSE(response: Response, abortSignal?: AbortSignal): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = response.body?.getReader();
  if (!reader) return events;

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (abortSignal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            events.push(evt);
            // Allow early termination via custom signal
            if ((evt as any).type === 'execution.paused') return events;
          } catch { /* ignore malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}

/**
 * Persisted execution (non-debug): reads events until paused, then returns.
 * Useful for HITL tests where the execution pauses for approval.
 */
export async function executeUntilPaused(
  flowId: string,
  input: Record<string, unknown>,
  cookieHeader?: string,
): Promise<{ events: SSEEvent[]; executionId: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, _debug: false }),
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.status}`);

  const events = await readSSE(res);
  const paused = events.find(e => e.type === 'execution.paused');
  if (!paused) throw new Error(`Execution did not pause. Events: ${JSON.stringify(events.slice(-3))}`);

  return { events, executionId: paused.data.executionId || paused.executionId || '' };
}

/**
 * Poll a persisted execution by ID until it finishes or times out.
 */
export async function pollExecution(
  request: APIRequestContext,
  executionId: string,
  timeoutMs = 30000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${API_URL}/executions/${executionId}`);
    if (!res.ok()) throw new Error(`Poll failed: ${res.status()}`);
    const exec = await res.json();
    if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'cancelled') {
      return exec;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}

interface SSEEvent {
  type: string;
  data?: any;
}
