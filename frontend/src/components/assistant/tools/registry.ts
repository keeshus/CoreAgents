import type { AssistantTool } from '../AssistantContext';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

// ── Helper: authenticated API call ─────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<string> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return 'Success';
  const data = await res.json();
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

// ── Code Node tools (work via DOM when a Code Node config is open) ────────────

const readCode: AssistantTool = {
  name: 'read_code',
  description: 'Read the current code in the Code Node editor. Open a Code Node config first.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const ta = document.querySelector('.fixed.inset-0.z-50 textarea.font-mono') as HTMLTextAreaElement;
    if (ta && ta.value) return ta.value;
    return 'No code editor found. Open a Code Node configuration panel first.';
  },
};

const replaceCode: AssistantTool = {
  name: 'replace_code',
  description: 'Replace the code in the Code Node editor. Call this whenever you produce or modify code.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'The new JavaScript code to insert' } },
    required: ['code'],
  },
  async execute({ code }) {
    const ta = document.querySelector('.fixed.inset-0.z-50 textarea.font-mono') as HTMLTextAreaElement;
    if (ta) {
      ta.value = code;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'Code updated in the editor.';
    }
    return 'No code editor found. Open a Code Node configuration panel first.';
  },
};

// ── Navigation tool ───────────────────────────────────────────────────────────

const navigateTo: AssistantTool = {
  name: 'navigate_to',
  description: 'Navigate to a page in the app',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: ['flows', 'approvals', 'settings', 'settings/endpoints', 'settings/mcp-servers', 'settings/knowledge', 'settings/users', 'profile'] },
    },
    required: ['page'],
  },
  async execute({ page }) {
    if (typeof window !== 'undefined') window.location.href = `/${page}`;
    return `Navigated to /${page}`;
  },
};

// ── Flow editor tools (stubs — injected by FlowEditor when active) ───────────

const getFlowJson: AssistantTool = {
  name: 'get_flow_json',
  description: 'Get the full flow definition as JSON. Use this to inspect the current flow structure and node configurations.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/flows\/([^/]+)\/edit/) : null;
    if (!match) return 'Not on a flow editor page. Open a flow in the editor first.';
    return apiFetch(`/flows/${match[1]}`);
  },
};

const addNode: AssistantTool = {
  name: 'add_node',
  description: 'Add a new node to the flow canvas',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['trigger', 'llm-agent', 'code', 'branch', 'output', 'hitl', 'mcp-tool', 'retriever', 'stop'] },
      label: { type: 'string', description: 'Optional label for the node' },
    },
    required: ['type'],
  },
  async execute() { return 'Not available — open a flow in the editor first'; },
};

// ── LLM Endpoints CRUD ───────────────────────────────────────────────────────

const listEndpoints: AssistantTool = {
  name: 'list_endpoints',
  description: 'List all configured LLM endpoints (providers, models, default status)',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/llm-endpoints'); },
};

const createEndpoint: AssistantTool = {
  name: 'create_endpoint',
  description: 'Add a new LLM endpoint. Requires name, providerType (anthropic/openai/litellm), apiKey, defaultModel.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name' },
      providerType: { type: 'string', enum: ['anthropic', 'openai', 'litellm'] },
      apiKey: { type: 'string' },
      defaultModel: { type: 'string' },
      baseUrl: { type: 'string', description: 'Base URL (required for LiteLLM)' },
    },
    required: ['name', 'providerType', 'apiKey', 'defaultModel'],
  },
  async execute({ name, providerType, apiKey, defaultModel, baseUrl }) {
    return apiFetch('/llm-endpoints', {
      method: 'POST',
      body: JSON.stringify({ name, providerType, apiKey, defaultModel, baseUrl }),
    });
  },
};

const deleteEndpoint: AssistantTool = {
  name: 'delete_endpoint',
  description: 'Delete an LLM endpoint by ID. Cannot delete the default endpoint.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Endpoint ID' } },
    required: ['id'],
  },
  async execute({ id }) {
    await apiFetch(`/llm-endpoints/${id}`, { method: 'DELETE' });
    return 'Endpoint deleted';
  },
};

// ── MCP Servers CRUD ─────────────────────────────────────────────────────────

const listMcpServers: AssistantTool = {
  name: 'list_mcp_servers',
  description: 'List all configured MCP servers with their tool counts and status',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/mcp-servers'); },
};

// ── Approvals ─────────────────────────────────────────────────────────────────

const getPendingApprovals: AssistantTool = {
  name: 'get_pending_approvals',
  description: 'List all executions currently awaiting human approval',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/executions/pending'); },
};

const approveExecution: AssistantTool = {
  name: 'approve_execution',
  description: 'Approve a HITL-paused execution by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: { type: 'string', description: 'The execution ID to approve' },
      decision: { type: 'string', description: 'The decision value (e.g. "approved")' },
    },
    required: ['executionId', 'decision'],
  },
  async execute({ executionId, decision }) {
    return apiFetch(`/executions/${executionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  },
};

const rejectExecution: AssistantTool = {
  name: 'reject_execution',
  description: 'Reject a HITL-paused execution by its ID, setting it to cancelled',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID to reject' } },
    required: ['executionId'],
  },
  async execute({ executionId }) {
    return apiFetch(`/executions/${executionId}/reject`, { method: 'POST' });
  },
};

// ── Executions ────────────────────────────────────────────────────────────────

const listExecutions: AssistantTool = {
  name: 'list_executions',
  description: 'Get execution history (last 100 executions across all flows)',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/executions'); },
};

const getExecutionDetails: AssistantTool = {
  name: 'get_execution_details',
  description: 'Get detailed step-by-step trace for a specific execution',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID' } },
    required: ['executionId'],
  },
  async execute({ executionId }) { return apiFetch(`/executions/${executionId}`); },
};

// ── Tool groups ──────────────────────────────────────────────────────────────────

export const toolGroups: Record<string, AssistantTool[]> = {
  'code-node': [readCode, replaceCode],
  'navigation': [navigateTo],
  'flow-editor': [getFlowJson, addNode],
  'settings-crud': [listEndpoints, createEndpoint, deleteEndpoint, listMcpServers],
  'approvals': [getPendingApprovals, approveExecution, rejectExecution],
  'executions': [listExecutions, getExecutionDetails],
};

// ── Registry: page key pattern → tool group names ──────────────────────────────

export function getToolGroupNames(pageKey: string, nodeType?: string): string[] {
  const groups: string[] = ['navigation'];

  if (pageKey?.startsWith('flow:')) groups.push('flow-editor', 'code-node');
  else if (pageKey?.startsWith('settings:')) groups.push('settings-crud');
  else if (pageKey === 'approvals') groups.push('approvals');
  else if (pageKey?.startsWith('executions:')) groups.push('executions');

  return groups;
}

export function getToolsForPage(pageKey: string, nodeType?: string): AssistantTool[] {
  const groupNames = getToolGroupNames(pageKey, nodeType);
  const tools: AssistantTool[] = [];
  for (const name of groupNames) {
    const group = toolGroups[name];
    if (group) tools.push(...group);
  }
  return tools;
}

// ── Tool factory functions (for injected tools from pages) ─────────────────────

export function createCodeTools(onRead: () => string, onReplace: (code: string) => void): AssistantTool[] {
  return [
    { ...readCode, async execute() { return onRead(); } },
    { ...replaceCode, async execute({ code }) { onReplace(code); return 'Code updated successfully'; } },
  ];
}

export function createNavigationTools(navigate: (path: string) => void): AssistantTool[] {
  return [{
    ...navigateTo,
    async execute({ page }) { navigate(`/${page}`); return `Navigated to /${page}`; },
  }];
}
