import type { AssistantTool } from '../AssistantContext';

// ── Tool definitions ────────────────────────────────────────────────────────────

const readCode: AssistantTool = {
  name: 'read_code',
  description: 'Read the current code in the Code Node editor',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Code reading not available in this context'; },
};

const replaceCode: AssistantTool = {
  name: 'replace_code',
  description: 'Replace the code in the Code Node editor with new code. Call this whenever you produce new code to keep the editor in sync.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'The new JavaScript code' } },
    required: ['code'],
  },
  async execute({ code }) { return 'Code replacement not available in this context'; },
};

const navigateTo: AssistantTool = {
  name: 'navigate_to',
  description: 'Navigate to a page in the app',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: ['flows', 'approvals', 'settings', 'settings/endpoints', 'settings/mcp-servers', 'settings/knowledge', 'profile'] },
    },
    required: ['page'],
  },
  async execute({ page }) { return `Navigation to ${page} not available in this context`; },
};

// ── Flow editor tools ────────────────────────────────────────────────────────────

const getFlowJson: AssistantTool = {
  name: 'get_flow_json',
  description: 'Get the full flow definition as JSON',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Not available in this context'; },
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
  async execute({ type, label }) { return `Adding ${type} node not available in this context`; },
};

// ── Settings tools ────────────────────────────────────────────────────────────────

const listEndpoints: AssistantTool = {
  name: 'list_endpoints',
  description: 'List all configured LLM endpoints',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Not available in this context'; },
};

const listMcpServers: AssistantTool = {
  name: 'list_mcp_servers',
  description: 'List all configured MCP servers',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Not available in this context'; },
};

// ── Approvals tools ───────────────────────────────────────────────────────────────

const getPendingApprovals: AssistantTool = {
  name: 'get_pending_approvals',
  description: 'Get a list of all executions currently awaiting approval',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Not available in this context'; },
};

// ── Executions tools ──────────────────────────────────────────────────────────────

const listExecutions: AssistantTool = {
  name: 'list_executions',
  description: 'Get execution history for the current flow',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return 'Not available in this context'; },
};

const getExecutionDetails: AssistantTool = {
  name: 'get_execution_details',
  description: 'Get detailed step-by-step trace for a specific execution',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID' } },
    required: ['executionId'],
  },
  async execute() { return 'Not available in this context'; },
};

// ── Tool groups ──────────────────────────────────────────────────────────────────

export const toolGroups: Record<string, AssistantTool[]> = {
  'code-node': [readCode, replaceCode],
  'navigation': [navigateTo],
  'flow-editor': [getFlowJson, addNode],
  'settings-crud': [listEndpoints, listMcpServers],
  'approvals': [getPendingApprovals],
  'executions': [listExecutions, getExecutionDetails],
};

// ── Registry: page key pattern → tool group names ──────────────────────────────

const pageToolMap: Record<string, string[]> = {
  'flows-list': ['navigation'],
  'approvals': ['navigation'],
  'profile': ['navigation'],
  'default': ['navigation'],
};

export function getToolGroupNames(pageKey: string, nodeType?: string): string[] {
  const groups: string[] = ['navigation'];

  // Flow editor pages
  if (pageKey?.startsWith('flow:')) groups.push('flow-editor');
  if (pageKey?.startsWith('executions:')) groups.push('executions');

  // Settings pages
  if (pageKey?.startsWith('settings:')) groups.push('settings-crud');

  // Approval page
  if (pageKey === 'approvals') groups.push('approvals');

  // Node-specific tools (when a node config is open)
  if (nodeType === 'code') groups.push('code-node');

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

// ── Tool executors that can be injected from pages ─────────────────────────────

export function createCodeTools(onRead: () => string, onReplace: (code: string) => void): AssistantTool[] {
  return [
    {
      ...readCode,
      async execute() { return onRead(); },
    },
    {
      ...replaceCode,
      async execute({ code }) { onReplace(code); return 'Code updated successfully'; },
    },
  ];
}

export function createNavigationTools(navigate: (path: string) => void): AssistantTool[] {
  return [
    {
      ...navigateTo,
      async execute({ page }) { navigate(`/${page}`); return `Navigated to ${page}`; },
    },
  ];
}
