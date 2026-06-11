import { z } from 'zod';
// ── Node type enum ──────────────────────────────────────────
export const NODE_TYPES = [
    'trigger',
    'llm-agent',
    'mcp-tool',
    'retriever',
    'branch',
    'code',
    'output',
];
export const nodeTypeSchema = z.enum(NODE_TYPES);
//# sourceMappingURL=flow.js.map