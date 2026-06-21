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
  description: 'Navigate to a page or a specific flow editor in the app',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: ['flows', 'approvals', 'settings', 'settings/endpoints', 'settings/mcp-servers', 'settings/knowledge', 'settings/users', 'profile'] },
      flowId: { type: 'string', description: 'Flow ID to navigate directly into its editor (e.g. "f30fa521-...")' },
    },
    required: [],
  },
  async execute({ page, flowId }) {
    if (flowId) {
      if (typeof window !== 'undefined') window.location.href = `/flows/${flowId}/edit`;
      return `Navigated to flow editor for ${flowId}`;
    }
    if (page) {
      if (typeof window !== 'undefined') window.location.href = `/${page}`;
      return `Navigated to /${page}`;
    }
    return 'Please provide a page or flowId to navigate to.';
  },
};

// ── Generic DOM helpers for node config modals ──────────────────────────────

// ── DOM helpers for node config panels ──────────────────────────────────────

function findModalField(label: string): HTMLElement | null {
  const labels = document.querySelectorAll('.fixed.inset-0.z-50 label, .fixed.inset-0.z-50 span.text-xs.font-medium, .fixed.inset-0.z-50 span.text-sm.font-medium');
  for (const el of labels) {
    if (el.textContent?.trim() === label) {
      const parent = el.closest('div') || el.parentElement;
      if (!parent) return null;
      // Try finding input, textarea, select, or checkbox
      return parent.querySelector('input, textarea, select') as HTMLElement;
    }
  }
  return null;
}

function reactSetValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el), 'value'
  )?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Node config tools (work with any open node config panel) ─────────────────

const getNodeConfig: AssistantTool = {
  name: 'get_node_config',
  description: 'Read all configuration fields from the currently open node config panel. Works with any node type.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const modal = document.querySelector('.fixed.inset-0.z-50');
    if (!modal) return 'No node config panel is open. Double-click a node to open it.';
    const fields: Record<string, string> = {};

    modal.querySelectorAll('input, textarea, select').forEach((el: any) => {
      const label = el.closest('div')?.querySelector('label, .text-xs.font-medium, .text-sm.font-medium');
      const name = label?.textContent?.trim() || el.placeholder || el.name || 'unknown';
      if (el.type === 'checkbox') fields[name] = el.checked ? 'true' : 'false';
      else fields[name] = el.value || '';
    });

    // Also read the button list for HITL nodes
    const buttonItems = modal.querySelectorAll('.space-y-2 .flex.items-center.gap-2 input');
    if (buttonItems.length > 0) {
      const buttons: { label: string; value: string }[] = [];
      buttonItems.forEach((input: HTMLInputElement, i: number) => {
        if (i % 2 === 0) buttons.push({ label: input.value, value: '' });
        else buttons[buttons.length - 1].value = input.value;
      });
      fields['buttons'] = JSON.stringify(buttons);
    }

    return JSON.stringify(fields, null, 2);
  },
};

const updateNodeField: AssistantTool = {
  name: 'update_node_field',
  description: 'Update a specific field in the open node config panel. Provide the exact label text and the new value.',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'The exact label text of the field (e.g. "System Prompt", "Condition Expression", "Allow reviewer feedback")' },
      value: { type: 'string', description: 'The new value to set. For checkboxes use "true" or "false".' },
    },
    required: ['label', 'value'],
  },
  async execute({ label, value }) {
    const field = findModalField(label);
    if (!field) return `Field "${label}" not found. Open the node config panel first.`;

    if ((field as HTMLInputElement).type === 'checkbox') {
      const cb = field as HTMLInputElement;
      const checked = value === 'true' || value === '1';
      if (cb.checked !== checked) {
        cb.click(); // React handles checkbox changes via click
      }
      return `Set checkbox "${label}" to ${checked}.`;
    }

    reactSetValue(field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value);
    return `Updated "${label}".`;
  },
};

const getAvailableNodes: AssistantTool = {
  name: 'get_available_nodes',
  description: 'List all node types available in the node catalog for adding to the flow.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return 'Available node types: trigger (starts a flow), llm-agent (calls an LLM), mcp-tool (calls an MCP tool), retriever (vector search), code (JavaScript), branch (condition routing), hitl (human approval), stop (terminates), output (returns result), parallel (concurrent branches). Click a node type button in the catalog panel on the left to add it.';
  },
};

// ── Flow listing tool ────────────────────────────────────────────────────────

const findFlow: AssistantTool = {
  name: 'find_flow',
  description: 'Search for a flow by name or list all flows. Returns flow IDs and names that can be used with navigate_to.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Flow name to search for (partial match). Leave empty to list all flows.' },
    },
  },
  async execute({ name }) {
    const data = await apiFetch('/flows');
    const flows = JSON.parse(data);
    if (!Array.isArray(flows)) return 'No flows found.';
    const matching = name
      ? flows.filter((f: any) => f.name?.toLowerCase().includes((name as string).toLowerCase()))
      : flows;
    if (matching.length === 0) return `No flow found matching "${name}".`;
    return matching.slice(0, 10).map((f: any) => `- ${f.name} (id: ${f.id})`).join('\n');
  },
};

// ── Flow editor tools ───────────────────────────────────────────────────────

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

const renameFlow: AssistantTool = {
  name: 'rename_flow',
  description: 'Rename the current flow. Provide the new name. The flow ID is taken from the current editor URL.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'The new name for the flow' } },
    required: ['name'],
  },
  async execute({ name }) {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/flows\/([^/]+)\/edit/) : null;
    if (!match) return 'Not on a flow editor page.';
    const flow = JSON.parse(await apiFetch(`/flows/${match[1]}`));
    flow.name = name;
    await apiFetch(`/flows/${match[1]}`, { method: 'PUT', body: JSON.stringify(flow) });
    return `Flow renamed to "${name}". The page will reload to show the new name.`;
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

const createMcpServer: AssistantTool = {
  name: 'create_mcp_server',
  description: 'Add a new MCP server. Requires name and url.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string', description: 'MCP server URL' },
    },
    required: ['name', 'url'],
  },
  async execute({ name, url }) { return apiFetch('/mcp-servers', { method: 'POST', body: JSON.stringify({ name, url }) }); },
};

const deleteMcpServer: AssistantTool = {
  name: 'delete_mcp_server',
  description: 'Delete an MCP server by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/mcp-servers/${id}`, { method: 'DELETE' }); },
};

const refreshMcpTools: AssistantTool = {
  name: 'refresh_mcp_tools',
  description: 'Refresh the tool list from an MCP server by its ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'The MCP server ID' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/mcp-servers/${id}/refresh`, { method: 'POST' }); },
};

// ── Embedding Providers ───────────────────────────────────────────────────────

const listEmbeddingProviders: AssistantTool = {
  name: 'list_embedding_providers',
  description: 'List all configured embedding providers',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/embedding-providers'); },
};

const createEmbeddingProvider: AssistantTool = {
  name: 'create_embedding_provider',
  description: 'Add a new embedding provider. Requires name, providerType (anthropic/openai/litellm), apiKey.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      providerType: { type: 'string', enum: ['anthropic', 'openai', 'litellm'] },
      apiKey: { type: 'string' },
      model: { type: 'string', description: 'Model name (default: text-embedding-ada-002)' },
    },
    required: ['name', 'providerType', 'apiKey'],
  },
  async execute({ name, providerType, apiKey, model }) {
    return apiFetch('/embedding-providers', { method: 'POST', body: JSON.stringify({ name, providerType, apiKey, model }) });
  },
};

const deleteEmbeddingProvider: AssistantTool = {
  name: 'delete_embedding_provider',
  description: 'Delete an embedding provider by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/embedding-providers/${id}`, { method: 'DELETE' }); },
};

// ── Vector Stores ──────────────────────────────────────────────────────────────

const listVectorStores: AssistantTool = {
  name: 'list_vector_stores',
  description: 'List all configured vector stores',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/vector-stores'); },
};

const createVectorStore: AssistantTool = {
  name: 'create_vector_store',
  description: 'Add a new vector store. Requires name, url, and optional apiKey.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string', description: 'Qdrant server URL' },
      apiKey: { type: 'string' },
    },
    required: ['name', 'url'],
  },
  async execute({ name, url, apiKey }) {
    return apiFetch('/vector-stores', { method: 'POST', body: JSON.stringify({ name, url, apiKey }) });
  },
};

const deleteVectorStore: AssistantTool = {
  name: 'delete_vector_store',
  description: 'Delete a vector store by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/vector-stores/${id}`, { method: 'DELETE' }); },
};

// ── Users ──────────────────────────────────────────────────────────────────────

const listUsers: AssistantTool = {
  name: 'list_users',
  description: 'List all users with their roles',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/users'); },
};

const createUser: AssistantTool = {
  name: 'create_user',
  description: 'Create a new user account. Requires email, password (min 8 chars), and name.',
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      password: { type: 'string', description: 'Minimum 8 characters' },
      name: { type: 'string' },
    },
    required: ['email', 'password', 'name'],
  },
  async execute({ email, password, name }) {
    return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  },
};

const deleteUser: AssistantTool = {
  name: 'delete_user',
  description: 'Delete a user by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/users/${id}`, { method: 'DELETE' }); },
};

const updateUserRole: AssistantTool = {
  name: 'update_user_role',
  description: "Change a user's role. Provide userId and roleId.",
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      roleId: { type: 'string', description: 'The role ID to assign' },
    },
    required: ['userId', 'roleId'],
  },
  async execute({ userId, roleId }) {
    return apiFetch(`/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role_id: roleId }) });
  },
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
  'navigation': [navigateTo, findFlow],
  'flow-editor': [getFlowJson, renameFlow, addNode, getNodeConfig, updateNodeField, getAvailableNodes, readCode, replaceCode],
  'endpoint-crud': [listEndpoints, createEndpoint, deleteEndpoint],
  'mcp-crud': [listMcpServers, createMcpServer, deleteMcpServer, refreshMcpTools],
  'embedding-crud': [listEmbeddingProviders, createEmbeddingProvider, deleteEmbeddingProvider],
  'store-crud': [listVectorStores, createVectorStore, deleteVectorStore],
  'user-crud': [listUsers, createUser, deleteUser, updateUserRole],
  'approvals': [getPendingApprovals, approveExecution, rejectExecution],
  'executions': [listExecutions, getExecutionDetails],
};

// ── Registry: page key pattern → tool group names ──────────────────────────────

export function getToolGroupNames(pageKey: string, nodeType?: string): string[] {
  const groups: string[] = ['navigation'];

  if (pageKey?.startsWith('flow:')) groups.push('flow-editor');
  else if (pageKey === 'settings:endpoints') groups.push('endpoint-crud');
  else if (pageKey === 'settings:mcp-servers') groups.push('mcp-crud');
  else if (pageKey === 'settings:knowledge') groups.push('embedding-crud', 'store-crud');
  else if (pageKey === 'settings:users') groups.push('user-crud');
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

