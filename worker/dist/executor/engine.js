import { topologicalSort } from './dag.js';
import { callLLM } from '../providers/index.js';
const slugify = (s) => s.toLowerCase().replace(/[\s.]+/g, '_');
export class HitlPauseError extends Error {
    nodeId;
    savedOutputs;
    buttons;
    prompt;
    constructor(nodeId, savedOutputs, buttons, prompt) {
        super(`HITL: waiting for human input at node ${nodeId}`);
        this.name = 'HitlPauseError';
        this.nodeId = nodeId;
        this.savedOutputs = savedOutputs;
        this.buttons = buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }];
        this.prompt = prompt || '';
    }
}
export class FlowStopError extends Error {
    nodeId;
    status;
    constructor(nodeId, message, status) {
        super(message || 'Execution stopped');
        this.name = 'FlowStopError';
        this.nodeId = nodeId;
        this.status = status || 'cancelled';
    }
}
export class FlowExecutor {
    abortController;
    constructor() {
        this.abortController = new AbortController();
    }
    abort() {
        this.abortController.abort();
    }
    async execute(flow, input, onEvent, context, options) {
        const { sorted, cycles } = topologicalSort(flow.nodes, flow.edges);
        if (cycles.length > 0) {
            throw new Error(`Flow contains cycles: ${JSON.stringify(cycles)}`);
        }
        const nodeOutputs = new Map();
        nodeOutputs.set('__input__', options?.inputOverride || input);
        // If replaying: pre-load saved outputs from previous run, skip nodes before HITL
        const replayFrom = options?.replayFrom;
        const replayOutputs = options?.replayOutputs || {};
        let beforeHitl = !!replayFrom;
        const steps = [];
        for (const node of sorted) {
            if (this.abortController.signal.aborted)
                break;
            // Skip nodes before the HITL node when replaying
            if (beforeHitl) {
                if (node.id === replayFrom) {
                    beforeHitl = false;
                }
                else if (replayOutputs[node.id] !== undefined) {
                    nodeOutputs.set(node.id, replayOutputs[node.id]);
                    const labelKey = slugify(node.data.label || node.id);
                    nodeOutputs.set(labelKey, replayOutputs[node.id]);
                    continue; // skip already-completed nodes
                }
            }
            // Skip MCP Tool / Retriever nodes — they only run when called by an LLM Agent
            if (node.data.type === 'mcp-tool' || node.data.type === 'retriever') {
                // Only skip if this node is connected to an LLM Agent's tool-input
                const outgoingEdges = flow.edges.filter(e => e.source === node.id);
                const isToolProvider = outgoingEdges.some(e => e.sourceHandle === 'tool-output' || e.targetHandle?.startsWith('tool-input'));
                if (isToolProvider) {
                    nodeOutputs.set(node.id, { note: 'called by LLM Agent' });
                    continue;
                }
            }
            // Check if this node should be skipped based on incoming edge conditions or sourceHandle
            const incomingEdges = flow.edges.filter(e => e.target === node.id);
            if (incomingEdges.length > 0) {
                const sourceOutputs = incomingEdges.map(e => {
                    // Try by node ID first, then by label — outputs are stored under label key
                    const byId = nodeOutputs.get(e.source);
                    if (byId !== undefined)
                        return byId;
                    const srcNode = flow.nodes.find(n => n.id === e.source);
                    if (srcNode) {
                        const labelKey = slugify(srcNode.data?.label || srcNode.id);
                        return nodeOutputs.get(labelKey);
                    }
                    return undefined;
                });
                const allFiltered = incomingEdges.every((e, i) => {
                    const src = sourceOutputs[i];
                    // Check explicit edge condition (branch nodes, HITL edges with conditions)
                    if (e.condition?.label) {
                        const routeLabel = src?.label ?? src?.decision;
                        if (routeLabel !== e.condition.label)
                            return true;
                    }
                    // For HITL sources without explicit conditions, filter by sourceHandle
                    // The HITL node has dynamic output handles per button. If the decision
                    // doesn't match the button at the sourceHandle index, filter this edge.
                    if (!e.condition?.label && e.sourceHandle) {
                        const sourceNode = flow.nodes.find(n => n.id === e.source);
                        if (sourceNode && sourceNode.data?.type === 'hitl') {
                            const buttons = sourceNode.data.config?.buttons || [];
                            const handleIndex = parseInt(e.sourceHandle.replace('output-', ''), 10);
                            const buttonValue = buttons[handleIndex]?.value;
                            const decision = src?.decision;
                            if (buttonValue && decision && buttonValue !== decision)
                                return true;
                        }
                    }
                    return false;
                });
                if (allFiltered) {
                    if (incomingEdges.some(e => e.condition?.label || e.sourceHandle)) {
                        nodeOutputs.set(node.id, { skipped: true, reason: 'No matching route' });
                        continue;
                    }
                    // All edges have no conditions/sourceHandles — misconfigured flow
                    throw new Error(`Node "${node.data.label || node.id}" has ${incomingEdges.length} incoming edges from a branch/HITL node, but none have routing conditions set. ` +
                        `Connect each edge to a specific output handle on the source node.`);
                }
            }
            const stepInput = this.prepareInput(node, flow.edges, nodeOutputs);
            // If node has inputFields set, filter stepInput to only those fields
            // Supports dot-notation paths like "Label.fieldname" for nested access
            const nodeConfig = node.data?.config || {};
            const inputFields = nodeConfig.inputFields;
            const filteredInput = inputFields && inputFields.length > 0 && stepInput && typeof stepInput === 'object'
                ? (() => {
                    const result = {};
                    const input = stepInput;
                    for (const path of inputFields) {
                        const dot = path.indexOf('.');
                        if (dot === -1) {
                            // Whole label: copy all data under this label
                            if (input[path] !== undefined)
                                result[path] = input[path];
                        }
                        else {
                            // Dot-path: extract specific field from within this label
                            const label = path.slice(0, dot);
                            const field = path.slice(dot + 1);
                            const labelData = input[label];
                            if (labelData && field in labelData) {
                                if (!result[label])
                                    result[label] = {};
                                result[label][field] = labelData[field];
                            }
                        }
                    }
                    return result;
                })()
                : stepInput;
            // Enrich step input with node config for debugging (LLM prompt, model, etc.)
            const enrichedInput = {
                ...(filteredInput || {}),
                _nodeType: node.data.type,
                _nodeLabel: node.data.label || node.data.type,
                _rawInput: filteredInput !== stepInput ? stepInput : undefined,
            };
            if (node.data.type === 'llm-agent') {
                const cfg = node.data.config || {};
                if (cfg.systemPrompt)
                    enrichedInput.systemPrompt = cfg.systemPrompt;
                if (cfg.model)
                    enrichedInput.model = cfg.model;
                if (cfg.temperature !== undefined)
                    enrichedInput.temperature = cfg.temperature;
            }
            if (node.data.type === 'branch') {
                const cfg = node.data.config || {};
                if (cfg.condition)
                    enrichedInput.condition = cfg.condition;
            }
            await onEvent(node.id, {
                type: 'step.started',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, nodeType: node.data.type, input: enrichedInput },
                timestamp: new Date().toISOString(),
            });
            try {
                // For HITL replay: separate what was displayed vs what gets forwarded
                let nodeInput = filteredInput;
                if (node.data.type === 'hitl' && replayFrom && node.id === replayFrom) {
                    const cfg = node.data?.config || {};
                    const displayFields = cfg.displayFields || [];
                    const forwardFields = cfg.forwardFields || [];
                    const raw = stepInput || {};
                    const displayed = {};
                    const forwarded = {};
                    if (displayFields.length > 0) {
                        for (const f of displayFields) {
                            if (raw[f] !== undefined)
                                displayed[f] = raw[f];
                        }
                    }
                    else {
                        Object.assign(displayed, raw);
                    }
                    if (forwardFields.length > 0) {
                        for (const f of forwardFields) {
                            if (raw[f] !== undefined)
                                forwarded[f] = raw[f];
                        }
                    }
                    else {
                        Object.assign(forwarded, raw);
                    }
                    // Store displayed for UI, pass forwarded to next node
                    nodeInput = { ...filteredInput, _reviewedContent: forwarded };
                }
                const output = await this.executeNode(node, nodeInput, context, onEvent);
                const outputKey = slugify(node.data.label || node.id);
                nodeOutputs.set(outputKey, output);
                nodeOutputs.set(node.id, output); // Also store under node ID for edge routing
                await onEvent(node.id, {
                    type: 'step.completed',
                    executionId: '',
                    nodeId: node.id,
                    data: { nodeId: node.id, nodeType: node.data.type, output: output },
                    timestamp: new Date().toISOString(),
                });
                steps.push({
                    id: '',
                    executionId: '',
                    nodeId: node.id,
                    nodeType: node.data.type,
                    status: 'completed',
                    input: stepInput,
                    output: output,
                    error: null,
                    startedAt: null,
                    completedAt: null,
                });
            }
            catch (err) {
                // If HITL node paused, populate saved outputs before re-throwing
                if (err instanceof HitlPauseError) {
                    const saved = {};
                    for (const [k, v] of nodeOutputs) {
                        if (k !== '__input__' && flow.nodes.some(n => n.id === k))
                            saved[k] = v;
                    }
                    const hitlConfig = node.data?.config || {};
                    throw new HitlPauseError(err.nodeId, saved, hitlConfig.buttons, err.prompt);
                }
                const error = err instanceof Error ? err.message : String(err);
                await onEvent(node.id, {
                    type: 'step.failed',
                    executionId: '',
                    nodeId: node.id,
                    data: { nodeId: node.id, nodeType: node.data.type, error },
                    timestamp: new Date().toISOString(),
                });
                steps.push({
                    id: '',
                    executionId: '',
                    nodeId: node.id,
                    nodeType: node.data.type,
                    status: 'failed',
                    input: stepInput,
                    output: null,
                    error,
                    startedAt: null,
                    completedAt: null,
                });
                throw err; // Stop execution on failure
            }
        }
        // Deduplicate: only include ID-keyed entries (labels are secondary keys)
        const nodeIds = new Set(flow.nodes.map(n => n.id));
        const uniqueOutput = Object.fromEntries([...nodeOutputs].filter(([k]) => k === '__input__' || nodeIds.has(k)));
        return { output: uniqueOutput, steps };
    }
    prepareInput(node, edges, nodeOutputs) {
        const accumulated = {};
        // First, spread __input__ fields so flags like _approved are accessible
        const flowInput = nodeOutputs.get('__input__');
        if (flowInput && typeof flowInput === 'object') {
            Object.assign(accumulated, flowInput);
        }
        // Then add all node outputs (overwrite __input__ keys with same name)
        for (const [key, value] of nodeOutputs) {
            if (key !== '__input__') {
                accumulated[key] = value;
            }
        }
        return accumulated;
    }
    async executeNode(node, input, context, onEvent) {
        const nodeData = node.data;
        const nodeType = nodeData.type;
        switch (nodeType) {
            case 'trigger': {
                return input;
            }
            case 'llm-agent': {
                const config = nodeData.config;
                if (!config?.endpointId) {
                    throw new Error('LLM Agent: no endpoint configured');
                }
                if (!context.getEndpoint) {
                    throw new Error('LLM Agent: execution context missing getEndpoint');
                }
                const endpoint = await context.getEndpoint(config.endpointId);
                if (!endpoint) {
                    throw new Error(`LLM Agent: endpoint ${config.endpointId} not found`);
                }
                // Extract message from input
                const inputObj = input;
                const userMessage = typeof inputObj?.message === 'string'
                    ? inputObj.message
                    : typeof inputObj === 'string'
                        ? inputObj
                        : JSON.stringify(inputObj);
                const history = Array.isArray(inputObj?.history) ? inputObj.history : [];
                const messages = [...history, { role: 'user', content: userMessage }];
                // Collect tool definitions from MCP Tool nodes connected via tool-input handles
                const toolDefs = [];
                if (context.getMCPServer) {
                    // Look for edges where target is this LLM node and targetHandle starts with 'tool-input'
                    const toolEdges = context.flowEdges?.filter((e) => e.target === node.id && (e.targetHandle?.startsWith('tool-input') || e.sourceHandle === 'tool-output')) || [];
                    for (const edge of toolEdges) {
                        const mcpNode = context.flowNodes?.find((n) => n.id === edge.source);
                        if (!mcpNode || mcpNode.data?.type !== 'mcp-tool')
                            continue;
                        const mcpConfig = mcpNode.data.config || {};
                        if (!mcpConfig.serverId || !mcpConfig.toolName)
                            continue;
                        try {
                            const server = await context.getMCPServer(mcpConfig.serverId);
                            if (server) {
                                const serverTools = server.tools || [];
                                const tool = serverTools.find((t) => t.name === mcpConfig.toolName);
                                if (tool) {
                                    toolDefs.push({
                                        name: tool.name,
                                        description: tool.description || '',
                                        input_schema: tool.inputSchema || {},
                                    });
                                }
                            }
                        }
                        catch { /* skip unavailable servers */ }
                    }
                }
                // Auto-inject built-in tools so the LLM can use store, file, utility tools
                toolDefs.push({ name: 'store_get', description: 'Read a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } }, { name: 'store_set', description: 'Persist a value by key (upserts)', input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string', description: 'Any JSON-serializable value' } }, required: ['key', 'value'] } }, { name: 'store_delete', description: 'Remove a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } }, { name: 'store_list', description: 'List all stored keys', input_schema: { type: 'object', properties: {} } }, { name: 'file_read', description: 'Read a file from the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }, { name: 'file_write', description: 'Write content to a file in the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }, { name: 'file_list', description: 'List files in a directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }, { name: 'now', description: 'Get the current date and time. Specify timezone (e.g. "Europe/Amsterdam") or locale (e.g. "nl-NL") for localized output.', input_schema: { type: 'object', properties: { timezone: { type: 'string' }, locale: { type: 'string' } } } }, { name: 'uuid', description: 'Generate a UUID', input_schema: { type: 'object', properties: {} } }, { name: 'log', description: 'Write a log entry (info/warn/error)', input_schema: { type: 'object', properties: { level: { type: 'string' }, message: { type: 'string' } }, required: ['message'] } }, { name: 'fetch', description: 'Perform an HTTP GET request', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } });
                // Token streaming callback
                const onToken = (token) => {
                    onEvent(node.id, {
                        type: 'stream.token',
                        executionId: '',
                        nodeId: node.id,
                        data: { nodeId: node.id, token },
                        timestamp: new Date().toISOString(),
                    });
                };
                // Tool-use loop: LLM may call tools, we execute them, feed back results
                const MAX_TOOL_ROUNDS = 5;
                const conversation = [...messages];
                let finalContent = '';
                // Resolve {{input.path.to.field}} template variables in system prompt
                const resolvedPrompt = resolveTemplate(config.systemPrompt || '', input);
                // Track all tool calls for the execution log
                const executedTools = [];
                for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                    if (this.abortController.signal.aborted)
                        break;
                    const response = await callLLM({
                        endpointId: config.endpointId,
                        model: config.model || endpoint.providerType,
                        systemPrompt: resolvedPrompt,
                        messages: conversation,
                        temperature: config.temperature ?? 0.7,
                        maxTokens: config.maxTokens ?? 4096,
                        onToken,
                        responseFormat: config.responseFormat || 'text',
                        outputSchema: config.outputSchema || undefined,
                        tools: toolDefs.length > 0 ? toolDefs : undefined,
                        signal: this.abortController.signal,
                    }, endpoint);
                    if (this.abortController.signal.aborted)
                        break;
                    if (response.text) {
                        finalContent = response.text;
                    }
                    // If no tool calls, we're done
                    if (!response.toolCalls || response.toolCalls.length === 0)
                        break;
                    // Add the assistant's tool-use message to conversation
                    conversation.push({ role: 'assistant', content: response.text || '' });
                    // Execute each tool call and add results
                    for (const tc of response.toolCalls) {
                        try {
                            // Find the MCP config from the connected tool nodes
                            const toolEdges = context.flowEdges?.filter((e) => e.target === node.id && (e.targetHandle?.startsWith('tool-input') || e.sourceHandle === 'tool-output')) || [];
                            let toolResult = 'Tool not found';
                            for (const edge of toolEdges) {
                                const mcpNode = context.flowNodes?.find((n) => n.id === edge.source);
                                if (!mcpNode)
                                    continue;
                                const mcpConfig = mcpNode.data.config || {};
                                if (mcpConfig.toolName === tc.name && mcpConfig.serverId) {
                                    const { mcpHub } = await import('../tools/hub.js');
                                    const server = await context.getMCPServer(mcpConfig.serverId);
                                    if (server) {
                                        if (!mcpHub.isConnected(server.id)) {
                                            await mcpHub.connect(server);
                                        }
                                        toolResult = JSON.stringify(await mcpHub.callTool(server.id, tc.name, tc.input));
                                    }
                                    break;
                                }
                            }
                            // Handle built-in utility tools (auto-injected, no MCP node required)
                            if (toolResult === 'Tool not found') {
                                try {
                                    const { callBuiltInTool } = await import('../tools/built-in.js');
                                    toolResult = await callBuiltInTool(tc.name, tc.input || {});
                                }
                                catch (err) {
                                    toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
                                }
                            }
                            conversation.push({
                                role: 'user',
                                content: `Tool result for ${tc.name}: ${toolResult}`,
                            });
                            executedTools.push({ name: tc.name, input: tc.input, result: toolResult });
                            onEvent(node.id, {
                                type: 'log',
                                executionId: '',
                                nodeId: node.id,
                                data: { nodeId: node.id, toolCall: tc.name, toolInput: tc.input, toolResult },
                                timestamp: new Date().toISOString(),
                            });
                        }
                        catch (err) {
                            executedTools.push({ name: tc.name, input: tc.input, result: `Error: ${err instanceof Error ? err.message : String(err)}` });
                            conversation.push({
                                role: 'user',
                                content: `Tool error for ${tc.name}: ${err instanceof Error ? err.message : String(err)}`,
                            });
                        }
                    }
                }
                const result = { content: finalContent };
                if (executedTools.length > 0)
                    result.toolCalls = executedTools;
                if (config?.responseFormat === 'json_object' && finalContent) {
                    try {
                        const parsed = JSON.parse(finalContent);
                        if (typeof parsed === 'object' && parsed !== null)
                            Object.assign(result, parsed);
                    }
                    catch { }
                }
                return result;
            }
            case 'mcp-tool': {
                const config = nodeData.config;
                if (!config?.serverId || !config?.toolName) {
                    throw new Error('MCP Tool: serverId and toolName are required');
                }
                if (!context.getMCPServer) {
                    throw new Error('MCP Tool: getMCPServer not available in execution context');
                }
                const server = await context.getMCPServer(config.serverId);
                if (!server) {
                    throw new Error(`MCP Tool: server ${config.serverId} not found`);
                }
                // Use the MCP Hub to call the tool
                const { mcpHub } = await import('../tools/hub.js');
                // Ensure the server is connected
                if (!mcpHub.isConnected(server.id)) {
                    await mcpHub.connect(server);
                }
                const toolResult = await mcpHub.callTool(server.id, config.toolName, config.parameters || {});
                return { result: toolResult, toolName: config.toolName, serverName: server.name };
            }
            case 'retriever': {
                const config = nodeData.config;
                const collectionName = config?.collectionName || 'default';
                const topK = config?.topK ?? 5;
                const minScore = config?.minScore ?? 0.5;
                // Extract query from input
                const inputObj = input;
                const query = typeof inputObj?.message === 'string'
                    ? inputObj.message
                    : typeof inputObj === 'string'
                        ? inputObj
                        : JSON.stringify(inputObj);
                // Generate embedding using the configured provider
                let embedding = new Array(1536).fill(0);
                if (config?.embeddingProviderId && context.getEmbeddingProvider) {
                    const provider = await context.getEmbeddingProvider(config.embeddingProviderId);
                    if (provider) {
                        const OpenAI = (await import('openai')).default;
                        const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined });
                        const resp = await client.embeddings.create({ model: provider.model, input: query });
                        embedding = resp.data[0].embedding;
                    }
                }
                // Search vector store
                let results = [];
                if (context.searchSimilar) {
                    results = await context.searchSimilar(collectionName, embedding, topK, minScore);
                }
                // Format as context
                const chunks = results.map(r => ({
                    text: r.chunkText,
                    similarity: r.similarity,
                    documentId: r.documentId,
                }));
                const contextText = chunks.map(c => c.text).join('\n\n');
                return { query, chunks, context: contextText, count: chunks.length };
            }
            case 'branch': {
                const config = nodeData.config;
                const condition = config.condition;
                const labels = config.outputLabels || ['true', 'false'];
                // Simple condition evaluation
                let verdict = false;
                try {
                    const inputObj = input;
                    // Support simple conditions like "input.score > 0.5"
                    // For MVP, evaluate a simple truthy check
                    if (condition && condition.trim()) {
                        // Try to evaluate as a JS expression with the input in scope
                        const fn = new Function('input', `return Boolean(${condition})`);
                        verdict = fn(inputObj);
                    }
                }
                catch {
                    verdict = false;
                }
                return { verdict, label: verdict ? labels[0] : labels[1] };
            }
            case 'code': {
                const config = nodeData.config;
                const code = config.code || 'return input;';
                try {
                    const fn = new Function('input', code);
                    return fn(input);
                }
                catch (err) {
                    throw new Error(`Code node execution failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            case 'parallel': {
                const config = nodeData.config;
                const subNodes = (config?.subNodes || []);
                if (subNodes.length === 0)
                    return { merged: {}, note: 'no sub-nodes' };
                // Run all sub-nodes in parallel — any failure aborts all siblings
                const parallelAbort = new AbortController();
                const results = await Promise.all(subNodes.map(async (subNode) => {
                    if (parallelAbort.signal.aborted)
                        throw new Error('Aborted by sibling failure');
                    try {
                        // Create a wrapper context that checks the parallel abort signal
                        const output = await this.executeNode(subNode, input, { ...context }, onEvent);
                        await onEvent(node.id, {
                            type: 'log',
                            executionId: '',
                            nodeId: node.id,
                            data: { nodeId: node.id, subNodeId: subNode.id, subNodeType: subNode.data.type, status: 'completed', output },
                            timestamp: new Date().toISOString(),
                        });
                        const subLabel = subNode.data?.label || subNode.data?.type || subNode.id;
                        return { id: subLabel, type: subNode.data.type, output };
                    }
                    catch (err) {
                        parallelAbort.abort(); // Kill all other siblings
                        throw err;
                    }
                }));
                // Merge all outputs by node ID
                const merged = {};
                for (const r of results) {
                    merged[r.id] = r.output;
                }
                return merged;
            }
            case 'hitl': {
                const inp = input;
                if (inp?._approved) {
                    return { decision: inp._decision || 'approved', feedback: inp._feedback || '', reviewedContent: inp._reviewedContent || inp };
                }
                // First run: pause for human input with resolved prompt
                const hitlCfg = nodeData.config || {};
                const resolvedPrompt = resolveTemplate(hitlCfg.prompt || '', input);
                const buttons = hitlCfg.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }];
                throw new HitlPauseError(node.id, {}, buttons, resolvedPrompt);
            }
            case 'output': {
                const inp = input;
                // text and json: return accumulated data as-is
                return inp || input;
            }
            case 'stop': {
                const config = nodeData.config || {};
                const msg = config.message || 'Execution stopped';
                const st = config.status || 'cancelled';
                throw new FlowStopError(node.id, msg, st);
            }
            default:
                throw new Error(`Unknown node type: ${nodeData.type}`);
        }
    }
}
// Resolve {{input.path.to.field}} template variables in system prompts.
// Looks up dot-notation paths in the input data.
function resolveTemplate(template, data) {
    return template.replace(/\{\{input\.([^}]+)\}\}/g, (match, path) => {
        const parts = path.trim().split('.');
        let current = data;
        for (const part of parts) {
            const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (bracketMatch) {
                // Bracket indexing: items[0] → items then index 0
                const key = bracketMatch[1];
                const idx = parseInt(bracketMatch[2]);
                if (current && typeof current === 'object' && key in current) {
                    const arr = current[key];
                    if (Array.isArray(arr) && idx < arr.length) {
                        current = arr[idx];
                    }
                    else {
                        console.warn(`Template variable ${match} could not be resolved`);
                        return '';
                    }
                }
                else {
                    console.warn(`Template variable ${match} could not be resolved`);
                    return '';
                }
            }
            else if (current && typeof current === 'object' && part in current) {
                current = current[part];
            }
            else {
                console.warn(`Template variable ${match} could not be resolved`);
                return '';
            }
        }
        if (typeof current === 'object')
            return JSON.stringify(current);
        return String(current);
    });
}
//# sourceMappingURL=engine.js.map