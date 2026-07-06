/**
 * Shared flow execution runner with step persistence and HITL/Stop error handling.
 * Used by the backend SSE endpoint, the BullMQ worker, and webhooks.
 */
import { FlowExecutor, HitlPauseError, FlowStopError } from './engine.js';
import type { ExecutionContext } from './engine.js';
import type { FlowDefinition, SSEEvent } from 'core-agents-shared';
import { createSidecarClient, createSandboxManager } from '../sandbox/index.js';

interface RunnerOptions {
  flow: FlowDefinition;
  input: Record<string, unknown>;
  executionId: string;
  db: any;
  executionsTable: any;
  executionStepsTable: any;
  eq: any;
  and: any;
  inArray?: any;
  onEvent?: (nodeId: string, event: SSEEvent) => void;
  agentContextsTable?: any;
  agentStoreTable?: any;
  groupsTable?: any;
}

/**
 * Execute a flow with full lifecycle management:
 * - Persists steps to the DB
 * - Handles HitlPauseError (stores pending_hitls, sets awaiting_approval)
 * - Handles FlowStopError (marks as cancelled/failed)
 * - Handles general errors (marks as failed)
 * - On success (marks as completed)
 */
export async function executeFlowWithPersistence(options: RunnerOptions): Promise<{ status: string; output?: any }> {
  const { flow, input, executionId, db: database, executionsTable, executionStepsTable, eq: eqFn, and: andFn, onEvent } = options;

  // Initialize sandbox
  const sidecarClient = createSidecarClient();
  const sandboxManager = createSandboxManager(sidecarClient);

  // Setup sandbox execution directory
  await sandboxManager.setup(executionId).catch(err => {
    console.error(`Failed to setup sandbox for ${executionId}:`, err);
    // Non-fatal — execution continues without sandbox
  });

  // Build execution context with context resolver support
  const executionContext: ExecutionContext = {
    flowNodes: flow.nodes,
    flowEdges: flow.edges,
    sandboxExecutionId: executionId,
    sandboxEnv: (input as any)?.__env || {},
    getGlobalContext: async () => {
      if (!options.agentStoreTable) return '';
      const [row] = await database.select().from(options.agentStoreTable).where(eqFn(options.agentStoreTable.key, 'global_context')).limit(1);
      return row?.value || '';
    },
    getGroupContext: async (groupId: string) => {
      if (!groupId || !options.groupsTable) return '';
      const [row] = await database.select({ context: options.groupsTable.context }).from(options.groupsTable).where(eqFn(options.groupsTable.id, groupId)).limit(1);
      return row?.context || '';
    },
    getAgentContexts: async (contextIds: string[]) => {
      if (!contextIds?.length || !options.agentContextsTable) return [];
      const inArrayFn = options.inArray;
      if (inArrayFn && contextIds.length > 1) {
        const rows = await database.select().from(options.agentContextsTable).where(inArrayFn(options.agentContextsTable.id, contextIds));
        return rows.map((r: any) => ({ title: r.title, content: r.content }));
      }
      const rows = await database.select().from(options.agentContextsTable).where(eqFn(options.agentContextsTable.id, contextIds[0]));
      return rows.map((r: any) => ({ title: r.title, content: r.content }));
    },
  };

  const executor = new FlowExecutor();

  try {
    const result = await executor.execute(
      flow,
      input,
      async (nodeId, event) => {
        const d = event.data;
        const nid = (d.nodeId as string) || nodeId;
        const ntype = (d.nodeType as string) || '';
        try {
          if (event.type === 'step.started') {
            await database.insert(executionStepsTable).values({
              execution_id: executionId, node_id: nid, node_type: ntype, node_label: d.nodeLabel as string | null,
              status: 'running', input: d.input as any, started_at: new Date(),
            });
          } else if (event.type === 'step.completed') {
            await database.update(executionStepsTable).set({
              status: 'completed', output: d.output as any, completed_at: new Date(),
            }).where(andFn(eqFn(executionStepsTable.execution_id, executionId), eqFn(executionStepsTable.node_id, nid)));
          } else if (event.type === 'step.failed') {
            await database.update(executionStepsTable).set({
              status: 'failed', error: d.error as string, completed_at: new Date(),
            }).where(andFn(eqFn(executionStepsTable.execution_id, executionId), eqFn(executionStepsTable.node_id, nid)));
          }
        } catch (e) { console.error('Failed to persist step:', e); }
        onEvent?.(nodeId, event);
      },
      executionContext,
    );

    await database.update(executionsTable).set({
      status: 'completed', output: result.output as any, completed_at: new Date(),
    }).where(eqFn(executionsTable.id, executionId));

    // Teardown sandbox on success
    await sandboxManager.teardown(executionId).catch(err => {
      console.error(`Failed to teardown sandbox for ${executionId}:`, err);
    });

    return { status: 'completed', output: result.output };
  } catch (err) {
    if (err instanceof HitlPauseError) {
      const hitlEntry = { nodeId: err.nodeId, prompt: err.prompt, buttons: err.buttons, savedOutputs: err.savedOutputs };
      await database.update(executionsTable).set({
        status: 'awaiting_approval',
        output: { ...err.savedOutputs, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _pausedAt: Date.now() } as any,
        pending_hitls: JSON.stringify([hitlEntry]) as any,
      }).where(eqFn(executionsTable.id, executionId));
      return { status: 'awaiting_approval' };
    }
    
    // Teardown sandbox on failure/cancellation (but not HITL)
    await sandboxManager.teardown(executionId).catch(err => {
      console.error(`Failed to teardown sandbox for ${executionId}:`, err);
    });

    if (err instanceof FlowStopError) {
      await database.update(executionsTable).set({
        status: err.status as any, error: err.message, completed_at: new Date(),
      }).where(eqFn(executionsTable.id, executionId));
      return { status: err.status as any };
    }
    const error = err instanceof Error ? err.message : String(err);
    await database.update(executionsTable).set({
      status: 'failed', error, completed_at: new Date(),
    }).where(eqFn(executionsTable.id, executionId));
    return { status: 'failed', output: { error } };
  }
}
