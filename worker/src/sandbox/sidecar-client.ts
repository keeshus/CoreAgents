export interface ExecRequest {
  executionId: string;
  command: string;
  timeout?: number;
  workdir?: string;
  env?: Record<string, string>;
  codeFile?: string;
  codeFileName?: string;
}

export interface ExecResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface SidecarClient {
  setup(executionId: string): Promise<void>;
  exec(request: ExecRequest): Promise<ExecResponse>;
  teardown(executionId: string): Promise<void>;
}

export function createSidecarClient(sidecarUrl?: string): SidecarClient {
  const baseUrl = sidecarUrl ?? process.env.SIDECAR_URL ?? 'http://localhost:4001';

  async function request(path: string, body: unknown): Promise<any> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = data?.error ?? `HTTP ${response.status}`;
      throw new Error(`sidecar ${path} failed: ${msg}`);
    }
    return data;
  }

  return {
    async setup(executionId: string): Promise<void> {
      await request('/setup', { executionId });
    },

    async exec(requestBody: ExecRequest): Promise<ExecResponse> {
      return request('/exec', requestBody);
    },

    async teardown(executionId: string): Promise<void> {
      await request('/teardown', { executionId });
    },
  };
}
