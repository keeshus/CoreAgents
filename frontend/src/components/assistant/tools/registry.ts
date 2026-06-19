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

// ── Tool groups ──────────────────────────────────────────────────────────────────

export const toolGroups: Record<string, AssistantTool[]> = {
  'code-node': [readCode, replaceCode],
  'navigation': [navigateTo],
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
