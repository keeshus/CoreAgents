import { topologicalSort } from './dag.js';
import { callLLM } from '../providers/index.js';
export class FlowExecutor {
    abortController;
    constructor() {
        this.abortController = new AbortController();
    }
    abort() {
        this.abortController.abort();
    }
    async execute(flow, input, onEvent, context) {
        const { sorted, cycles } = topologicalSort(flow.nodes, flow.edges);
        if (cycles.length > 0) {
            throw new Error(`Flow contains cycles: ${JSON.stringify(cycles)}`);
        }
        const nodeOutputs = new Map();
        // Store the initial input at a special key
        nodeOutputs.set('__input__', input);
        const steps = [];
        for (const node of sorted) {
            if (this.abortController.signal.aborted)
                break;
            const stepInput = this.prepareInput(node, flow.edges, nodeOutputs);
            await onEvent(node.id, {
                type: 'step.started',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, nodeType: node.data.type, input: stepInput },
                timestamp: new Date().toISOString(),
            });
            try {
                const output = await this.executeNode(node, stepInput, context, onEvent);
                nodeOutputs.set(node.id, output);
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
        return { output: Object.fromEntries(nodeOutputs), steps };
    }
    prepareInput(node, edges, nodeOutputs) {
        const incomingEdges = edges.filter(e => e.target === node.id);
        if (incomingEdges.length === 0) {
            // No incoming edges: use the flow input
            return nodeOutputs.get('__input__');
        }
        if (incomingEdges.length === 1) {
            return nodeOutputs.get(incomingEdges[0].source);
        }
        // Multiple incoming: merge all
        const merged = {};
        for (const e of incomingEdges) {
            const sourceOutput = nodeOutputs.get(e.source);
            if (sourceOutput !== undefined) {
                merged[e.source] = sourceOutput;
            }
        }
        return merged;
    }
    async executeNode(node, input, context, onEvent) {
        const nodeData = node.data;
        switch (nodeData.type) {
            case 'trigger':
                return input; // Pass through
            case 'llm-agent': {
                const config = nodeData.config;
                if (!config?.endpointId) {
                    throw new Error('LLM Agent: no endpoint configured');
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
                // Build messages from history if available, otherwise just the current message
                const history = Array.isArray(inputObj?.history) ? inputObj.history : [];
                const messages = [...history, { role: 'user', content: userMessage }];
                // Token streaming callback
                let streamedContent = '';
                const onToken = (token) => {
                    streamedContent += token;
                    onEvent(node.id, {
                        type: 'stream.token',
                        executionId: '',
                        nodeId: node.id,
                        data: { nodeId: node.id, token },
                        timestamp: new Date().toISOString(),
                    });
                };
                const response = await callLLM({
                    endpointId: config.endpointId,
                    model: config.model || endpoint.providerType,
                    systemPrompt: config.systemPrompt || '',
                    messages,
                    temperature: config.temperature ?? 0.7,
                    maxTokens: config.maxTokens ?? 4096,
                    onToken,
                }, endpoint);
                return { content: response, streamedContent: streamedContent || response };
            }
            case 'mcp-tool': {
                // Placeholder -- MCP Hub will be wired in Phase 4
                return { message: 'MCP tool execution coming in Phase 4', input };
            }
            case 'retriever': {
                // Placeholder -- RAG will be wired in Phase 4
                return { message: 'Retriever execution coming in Phase 4', input };
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
                const code = config.code || 'return payload;';
                try {
                    const fn = new Function('payload', code);
                    return fn(input);
                }
                catch (err) {
                    throw new Error(`Code node execution failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            case 'output':
                return input; // Pass through -- formatting handled by the caller
            default:
                throw new Error(`Unknown node type: ${nodeData.type}`);
        }
    }
}
//# sourceMappingURL=engine.js.map