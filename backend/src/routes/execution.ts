import { Router } from 'express';
import { eq, and, desc, sql, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { executions, executionSteps, flows, llmEndpoints, mcpServers, embeddingProviders, vectorStores, groups, groupMembers, users, agentContexts, agentStore, secretAccessLog } from '../db/schema.js';
import { FlowExecutor, HitlPauseError, FlowStopError } from '../../../worker/src/executor/engine.js';
import { getStore, listStores } from '../vector-stores/index.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { logger } from '../utils/logger.js';
import type { SSEEvent, FlowDefinition, ExecutionStep, EnvVarEntry } from 'core-agents-shared';
import { createSidecarClient, createSandboxManager } from '../../../worker/src/sandbox/index.js';

const secretStore = new Map<string, string>();
const router = Router();

// In-memory registry of active executors for cancellation
const activeExecutors = new Map<string, FlowExecutor>();

// GET /api/executions/pending — list executions awaiting approval (for approvals page)
router.get('/executions/pending', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const isAdmin = req.user?.permissions?.includes('admin');
  let conditions = [eq(executions.status, 'awaiting_approval')];

  if (!isAdmin) {
    const userGroupIds = await db
      .select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, req.user!.userId));
    const groupIdList = userGroupIds.map(g => g.groupId);

    const accessibleFlows = await db.select({ id: flows.id })
      .from(flows)
      .where(
        groupIdList.length > 0
          ? or(isNull(flows.group_id), inArray(flows.group_id, groupIdList))
          : isNull(flows.group_id)
      );
    const accessibleFlowIds = accessibleFlows.map(f => f.id);
    conditions.push(inArray(executions.flow_id, accessibleFlowIds));
  }

  const result = await db
    .select()
    .from(executions)
    .where(and(...conditions))
    .orderBy(desc(executions.created_at));
  // Filter out debug runs
  const filtered = result.filter((r: any) => !r.input?._debug);
  res.json(filtered);
}));

// GET /api/executions — list executions with optional status filter (admin only)
router.get('/executions', requirePermission('admin'), asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt((req.query.limit as string) || '50');
  const offset = parseInt((req.query.offset as string) || '0');
  const conditions: any[] = [];
  if (status) conditions.push(sql`${executions.status} = ${status}`);

  const results = await db.select({
    id: executions.id,
    flow_id: executions.flow_id,
    status: executions.status,
    input: executions.input,
    output: executions.output,
    error: executions.error,
    started_at: executions.started_at,
    completed_at: executions.completed_at,
    created_at: executions.created_at,
    pending_hitls: executions.pending_hitls,
  })
    .from(executions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(executions.created_at))
    .limit(limit)
    .offset(offset);

  // Enhance with flow names
  const flowIds = [...new Set(results.map(r => r.flow_id))];
  const flowMap: Record<string, string> = {};
  if (flowIds.length > 0) {
    const flowRows = await db.select({ id: flows.id, name: flows.name }).from(flows).where(inArray(flows.id, flowIds));
    for (const f of flowRows) { flowMap[f.id] = f.name; }
  }

  res.json(results.map(r => ({
    ...r,
    flow_name: flowMap[r.flow_id] || 'Unknown',
  })));
}));

// GET /api/executions/:id — get single execution
router.get('/executions/:id', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [exec] = await db.select({
    id: executions.id,
    flow_id: executions.flow_id,
    status: executions.status,
    input: executions.input,
    output: executions.output,
    error: executions.error,
    started_at: executions.started_at,
    completed_at: executions.completed_at,
    created_at: executions.created_at,
    pending_hitls: executions.pending_hitls,
  }).from(executions).where(eq(executions.id, id)).limit(1);
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  const [flow] = await db.select({ name: flows.name }).from(flows).where(eq(flows.id, exec.flow_id)).limit(1);
  const steps = await db.select().from(executionSteps).where(eq(executionSteps.execution_id, id)).orderBy(executionSteps.started_at);
  res.json({ ...exec, flow_name: flow?.name || 'Unknown', steps });
}));

// POST /api/executions/:executionId/cancel — cancel a running execution
router.post('/executions/:executionId/cancel', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  // Abort in-process if available
  const executor = activeExecutors.get(executionId);
  if (executor) {
    executor.abort();
    activeExecutors.delete(executionId);
  }

  // Mark as cancelled in DB
  await db
    .update(executions)
    .set({ status: 'cancelled', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'cancelled' });
}));

// POST /api/executions/:id/admin-cancel — force-cancel a stuck execution (admin only)
router.post('/executions/:id/admin-cancel', requirePermission('admin'), asyncHandler(async (req, res) => {
  const id = req.params.id;
  await db.update(executions).set({
    status: 'cancelled',
    error: 'Cancelled by admin',
    completed_at: new Date(),
  }).where(eq(executions.id, String(req.params.id)));
  res.json({ status: 'cancelled' });
}));

// ── POST /api/flows/:flowId/execute — SSE-streamed execution ───────────────────

router.post(
  '/flows/:flowId/execute',
  requirePermission('flow:create'),
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const { input = {}, nodes: canvasNodes, edges: canvasEdges } = req.body;

    // SSE headers ------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Helper to emit SSE data frames ------------------------------
    const emitSSE = (data: SSEEvent) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Use canvas state if provided (debug runs from editor), otherwise load from DB
    let flowNodes = canvasNodes;
    let flowEdges = canvasEdges;
    let flowName = '';
    let flowContext = '';
    let flowGroupId: string | undefined;
    let flowDefEnvVars: any[] | undefined;

    if (!flowNodes || !flowEdges) {
      const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
      if (!flow) {
        emitSSE({
          type: 'execution.failed',
          executionId: '',
          data: { error: 'Flow not found' },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }
      flowNodes = flow.nodes;
      flowEdges = flow.edges;
      flowName = flow.name;
      flowContext = flow.flow_context || '';
      flowGroupId = flow.group_id || undefined;
      flowDefEnvVars = flow.env_vars as any[] | undefined;
    } else {
      // Canvas nodes provided (debug from editor) — still load envVars from DB
      const [envFlow] = await db.select({ env_vars: flows.env_vars }).from(flows).where(eq(flows.id, flowId)).limit(1);
      if (envFlow) {
        flowDefEnvVars = envFlow.env_vars as any[] | undefined;
      }
    }

    // Create execution record ------------------------------------
    const isDebug = (input as any)?._debug === true;
    // Store a snapshot of the flow definition so HITL replay uses the original flow
    const flowSnapshot = { nodes: flowNodes, edges: flowEdges, version: 0 };

    let execId: string;
    let exec: any;
    if (isDebug) {
      // Debug runs: don't persist to DB, just generate a temp ID for SSE
      execId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    } else {
      const inserted = await db
        .insert(executions)
        .values({
          flow_id: flowId,
          status: 'running',
          input,
          output: { _flowSnapshot: flowSnapshot } as any,
          started_at: new Date(),
        })
        .returning();
      exec = inserted[0];
      execId = exec.id;
    }

    // Emit started event
    emitSSE({
      type: 'execution.started',
      executionId: execId,
      data: { flowId, flowName: flowName || 'Debug Run' },
      timestamp: new Date().toISOString(),
    });

    // Initialize sandbox for this execution
    const sidecarClient = createSidecarClient();
    const sandboxManager = createSandboxManager(sidecarClient);
    const sandboxExecutionId = execId;

    try {
      await sandboxManager.setup(sandboxExecutionId);
    } catch (err) {
      console.error(`Sandbox setup failed for ${sandboxExecutionId}:`, err);
      // Non-fatal
    }

    // Build execution context: resolve LLM endpoints from DB ------
    const executionContext: import('../../../worker/src/executor/engine.js').ExecutionContext = {
      currentExecutionId: execId,
      getEndpoint: async (endpointId: string) => {
        const [endpoint] = await db
          .select()
          .from(llmEndpoints)
          .where(eq(llmEndpoints.id, endpointId));
        if (!endpoint) return null;
        if (endpoint.group_id && endpoint.group_id !== flowGroupId) return null;
        return {
          providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
          apiKey: endpoint.api_key,
          baseUrl: endpoint.base_url ?? null,
        };
      },
      getMCPServer: async (serverId: string) => {
        const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
        if (!server) return null;
        if (server.group_id && server.group_id !== flowGroupId) return null;
        return {
          id: server.id,
          name: server.name,
          url: server.url,
          tools: server.tools as any[],
          enabled: server.enabled,
        };
      },
      getEmbeddingProvider: async (providerId: string) => {
        const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
        if (!ep) return null;
        if (ep.group_id && ep.group_id !== flowGroupId) return null;
        return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
      },
      getVectorStore: async (storeId: string) => {
        const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
        if (!vs) return null;
        if (vs.group_id && vs.group_id !== flowGroupId) return null;
        return { name: vs.name, url: vs.url, apiKey: vs.api_key };
      },
      getFlow: async (flowId: string, ancestry?: string[]) => {
        const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
        if (!flow) return null;
        if (ancestry?.includes(flowId)) {
          throw new Error(`Circular subflow reference detected: ${ancestry.join(' -> ')} -> ${flow.name}`);
        }
        return {
          id: flow.id,
          name: flow.name,
          description: flow.description || '',
          nodes: flow.nodes as any,
          edges: flow.edges as any,
          version: flow.version,
          envVars: flow.env_vars as EnvVarEntry[] | undefined,
          createdAt: flow.created_at?.toISOString() || '',
          updatedAt: flow.updated_at?.toISOString() || '',
        };
      },
      onSubExecution: async (data) => {
        if (isDebug) return `debug_sub_${Date.now()}`;
        const [subExec] = await db.insert(executions).values({
          flow_id: data.subflowId,
          parent_execution_id: data.parentExecutionId,
          subflow_node_id: data.subflowNodeId,
          subflow_depth: data.depth,
          status: 'running',
          input: data.input,
          started_at: new Date(),
        }).returning();
        return subExec.id;
      },
      completeSubExecution: async (subExecutionId, output, status, error) => {
        if (isDebug) return;
        await db.update(executions).set({
          status,
          output: output as any,
          error: error || null,
          completed_at: new Date(),
        }).where(eq(executions.id, subExecutionId));
      },
      getGlobalContext: async () => {
        const [row] = await db.select().from(agentStore).where(eq(agentStore.key, 'global_context')).limit(1);
        return (row?.value as string) || '';
      },
      getGroupContext: async (groupId: string) => {
        if (!groupId) return '';
        const [row] = await db.select({ context: groups.context }).from(groups).where(eq(groups.id, groupId)).limit(1);
        return row?.context || '';
      },
      getAgentContexts: async (contextIds: string[]) => {
        if (!contextIds?.length) return [];
        const rows = await db.select().from(agentContexts).where(inArray(agentContexts.id, contextIds));
        return rows.map(r => ({ title: r.title, content: r.content }));
      },
      getSecret: async (secretName: string, options?: { scope?: 'app' | 'group' | 'flow' }) => {
        const { secrets: secretsTable } = await import('../db/schema.js');
        const { and, eq } = await import('drizzle-orm');
        const scope = options?.scope || 'app';
        const [secret] = await db.select().from(secretsTable).where(
          and(eq(secretsTable.name, secretName), eq(secretsTable.scope, scope))
        ).limit(1);
        if (!secret || !secret.encrypted_value || !secret.encryption_iv || !secret.encryption_tag) return null;
        const { decrypt } = await import('../utils/encryption.js');
        return decrypt(secret.encrypted_value, secret.encryption_iv, secret.encryption_tag, secret.key_version);
      },
      getCyberArkSecret: async (variableId: string) => {
        const { getSecret: conjurGetSecret } = await import('../services/cyberark.js');
        const { secretVaults: vaultsTable, groupVaultConfig: gvcTable } = await import('../db/schema.js');
        const { eq } = await import('drizzle-orm');

        let vaultId: string | undefined;
        if (flowGroupId) {
          const [gvc] = await db.select({ vaultId: gvcTable.vault_id }).from(gvcTable).where(eq(gvcTable.group_id, flowGroupId)).limit(1);
          if (gvc) vaultId = gvc.vaultId;
        }
        const vaultCondition = vaultId ? eq(vaultsTable.id, vaultId) : eq(vaultsTable.is_connected, true);
        const [vault] = await db.select().from(vaultsTable).where(vaultCondition).limit(1);
        if (!vault) return null;
        const keyParts = vault.api_key.split(':');
        const { decrypt } = await import('../utils/encryption.js');
        const apiKey = await decrypt(keyParts[0], keyParts[1], keyParts[2], parseInt(keyParts[3]));
        return conjurGetSecret({
          baseUrl: vault.base_url,
          account: vault.account,
          login: vault.login,
          apiKey,
          caCert: vault.ca_cert || undefined,
          selfHosted: vault.self_hosted,
        }, variableId);
      },
      setSecret: (name: string, value: string) => {
        secretStore.set(name, value);
      },
      logSecretAccess: (entry: { name: string; action: string; source: string }) => {
        // Fire-and-forget audit log
        db.insert(secretAccessLog).values({
          action: entry.action,
          metadata: { secretName: entry.name, source: entry.source, executionId: flowId },
          created_at: new Date(),
        }).catch(() => {});
      },
      sandboxExecutionId,
      sandboxEnv: (input as any)?.__env || {},
    };

    // Resolve flow-level env vars (static, core_secret, cyberark) into sandboxEnv
    const inputEnv: Record<string, string> = (input as any)?.__env || {};
    const flowEnvVars = flowDefEnvVars;
    if (Array.isArray(flowEnvVars)) {
      for (const entry of flowEnvVars) {
        if (entry.type === 'static' || !entry.type) {
          inputEnv[entry.name] = entry.value;
        } else if (entry.type === 'core_secret' && executionContext.getSecret) {
          try {
            const secretVal = await executionContext.getSecret(entry.value);
            if (secretVal) inputEnv[entry.name] = secretVal;
          } catch {}
        } else if (entry.type === 'cyberark' && executionContext.getCyberArkSecret) {
          try {
            const cyberVal = await executionContext.getCyberArkSecret(entry.value);
            if (cyberVal) inputEnv[entry.name] = cyberVal;
          } catch {}
        }
      }
    }
    executionContext.sandboxEnv = inputEnv;

    // Map Drizzle row (snake_case) to FlowDefinition (camelCase) BEFORE building context
    const flowDef: FlowDefinition = {
      id: flowId,
      name: flowName,
      description: '',
      nodes: flowNodes as any,
      edges: flowEdges as any,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      flowContext: flowContext,
      groupId: flowGroupId,
    };

    // Add flowNodes/flowEdges to context now that flowDef exists
    executionContext.flowNodes = flowDef.nodes as any;
    executionContext.flowEdges = flowDef.edges as any;
    executionContext.searchSimilar = async (collectionName, queryEmbedding, topK, minScore) => {
      const store = getStore('qdrant') || getStore('pgvector') || listStores().length > 0 ? getStore(listStores()[0]) : undefined;
      if (!store) return [];
      return store.search(collectionName, queryEmbedding, topK, minScore);
    };

    const executor = new FlowExecutor();
    activeExecutors.set(execId, executor);

    res.on('close', () => {
      executor.abort();
      activeExecutors.delete(execId);
    });

    let skipTeardown = false;
    try {
      const result = await executor.execute(
        flowDef,
        input as Record<string, unknown>,
        // onEvent: persist steps + stream to client ---------------
        async (nodeId, event) => {
          // Attach the execution ID (the engine sets it to '' initially)
          const richEvent: SSEEvent = {
            ...event,
            executionId: execId,
          };

          // Persist step lifecycle to the database
          if (!isDebug) {
            const data = event.data;
            const hierarchy = event.hierarchy || (data.hierarchy as { path: string; depth: number } | undefined);
            // For subflow steps, prefix node ID with parent hierarchy for unique identification
            const prefix = hierarchy ? hierarchy.path.replace(/->/g, ':') + ':' : '';
            const resolvedNodeId = (data.nodeId as string) || nodeId;
            const hierarchicalNodeId = prefix ? `${prefix}${resolvedNodeId}` : resolvedNodeId;
            const resolvedNodeType = (data.nodeType as string) || '';
            const iter = (data as any).iteration ?? 0;

            if (event.type === 'step.started') {
              await db.insert(executionSteps).values({
                execution_id: exec.id, node_id: hierarchicalNodeId, node_type: resolvedNodeType,
                node_label: data.nodeLabel as string | null, iteration: iter,
                status: 'running', input: data.input as any, started_at: new Date(),
                hierarchy: hierarchy as any || null,
              });
            } else if (event.type === 'step.completed') {
              await db.update(executionSteps).set({
                status: 'completed', output: data.output as any, completed_at: new Date(),
                hierarchy: hierarchy as any || null,
              }).where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, hierarchicalNodeId)));
            } else if (event.type === 'step.failed') {
              await db.update(executionSteps).set({
                status: 'failed', error: data.error as string, completed_at: new Date(),
                hierarchy: hierarchy as any || null,
              }).where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, hierarchicalNodeId)));
            }
          }

          // Stream event to the SSE client
          emitSSE(richEvent);
        },
        executionContext,
      );

      // Mark execution as completed in DB
      if (!isDebug) {
        const completedOutput = { ...(result.output as object || {}), _flowSnapshot: flowSnapshot };
        await db
          .update(executions)
          .set({
            status: 'completed',
            output: completedOutput as any,
            completed_at: new Date(),
          })
          .where(eq(executions.id, exec.id));
      }

      activeExecutors.delete(execId);
      emitSSE({
        type: 'execution.completed',
        executionId: execId,
        data: { output: result.output, steps: result.steps },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      // Handle FlowStop — terminate execution immediately
      if (err instanceof FlowStopError) {
        activeExecutors.delete(execId);
        if (!isDebug) {
          await db
            .update(executions)
            .set({
              status: err.status as any,
              error: err.message,
              completed_at: new Date(),
            })
            .where(eq(executions.id, exec.id));
        }

        emitSSE({
          type: 'execution.stopped',
          executionId: execId,
          data: { status: err.status, message: err.message },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }

      // Handle HITL pause — save partial outputs and await approval
      if (err instanceof HitlPauseError) {
        skipTeardown = true;
        activeExecutors.delete(execId);
        const hitlCfg = (flowDef.nodes || []).find((n: any) => n.id === err.nodeId)?.data?.config || {};
        if (!isDebug) {
          await db
            .update(executions)
            .set({
              status: 'awaiting_approval',
              output: { ...err.savedOutputs, _flowSnapshot: flowSnapshot, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _hitlAllowFeedback: (hitlCfg as any).allowFeedback !== false, _hitlNodeId: err.nodeId, _pausedAt: Date.now(), _nextIteration: 1 } as any,
              pending_hitls: JSON.stringify([{
                nodeId: err.nodeId,
                prompt: err.prompt,
                buttons: err.buttons,
                savedOutputs: err.savedOutputs,
                assignmentType: err.assignmentType,
                assignees: err.assignees,
                requiredApprovals: err.requiredApprovals,
              }]) as any,
            })
            .where(eq(executions.id, exec.id));
        }

        emitSSE({
          type: 'execution.paused',
          executionId: execId,
          data: { nodeId: err.nodeId, savedOutputs: err.savedOutputs, buttons: err.buttons, prompt: err.prompt, allowFeedback: (hitlCfg as any).allowFeedback !== false, message: 'Waiting for human approval' },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }

      const error = err instanceof Error ? err.message : String(err);
      console.error('Flow execution failed:', error);
      activeExecutors.delete(execId);

      if (!isDebug) {
        await db
          .update(executions)
          .set({
            status: 'failed',
            error,
            completed_at: new Date(),
          })
          .where(eq(executions.id, exec.id));
      }

      emitSSE({
        type: 'execution.failed',
        executionId: execId,
        data: { error },
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (!skipTeardown) {
        sandboxManager.teardown(sandboxExecutionId).catch(err => {
          console.error(`Sandbox teardown failed for ${sandboxExecutionId}:`, err);
        });
      }
    }

    res.end();
  }),
);

// ── POST /api/executions/:executionId/approve — approve HITL and resume flow ──

router.post('/executions/:executionId/approve', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;
  const { feedback = '', decision = 'approved', data: userData = {}, hitlNodeId } = req.body || {};

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  // Find the hitlNodeId — use provided one or fall back to first pending
  const pendingHitls = (exec.pending_hitls || []) as any[];
  const hitlEntry = hitlNodeId
    ? pendingHitls.find((h: any) => h.nodeId === hitlNodeId)
    : pendingHitls[0];
  if (!hitlEntry) { res.status(400).json({ error: 'No pending HITL found' }); return; }

  const userId = req.user!.userId;

  // Resolve group members for group-type assignments
  if (hitlEntry.assignmentType === 'group' || hitlEntry.assignees?.groupIds?.length) {
    if (!hitlEntry.assignees) hitlEntry.assignees = { userIds: [], roleIds: [], groupIds: [] };
    const groupIdToResolve = hitlEntry.assignedGroupId || hitlEntry.assignees?.groupIds?.[0];
    if (groupIdToResolve) {
      if (!hitlEntry.assignees.groupIds.includes(groupIdToResolve)) {
        hitlEntry.assignees.groupIds.push(groupIdToResolve);
      }
      const members = await db.select({ userId: groupMembers.user_id })
        .from(groupMembers)
        .where(eq(groupMembers.group_id, groupIdToResolve));
      for (const m of members) {
        if (!hitlEntry.assignees.userIds.includes(m.userId)) {
          hitlEntry.assignees.userIds.push(m.userId);
        }
      }
    }
  }

  // ── Single-user, single-role, or single-group assignment: resolve and enforce ──
  if (hitlEntry.assignmentType && hitlEntry.assignmentType !== 'multi') {
    let authorizedUserIds: string[] = [];

    if (hitlEntry.assignmentType === 'user' && hitlEntry.assignedUserId) {
      authorizedUserIds = [hitlEntry.assignedUserId];
    } else if (hitlEntry.assignmentType === 'role' && hitlEntry.assignedRoleId) {
      const roleUsers = await db.select({ id: users.id }).from(users).where(eq(users.role_id, hitlEntry.assignedRoleId));
      authorizedUserIds = roleUsers.map(u => u.id);
    } else if (hitlEntry.assignmentType === 'group') {
      const groupId = hitlEntry.assignedGroupId || hitlEntry.assignees?.groupIds?.[0];
      if (groupId) {
        const members = await db.select({ userId: groupMembers.user_id })
          .from(groupMembers)
          .where(eq(groupMembers.group_id, groupId));
        authorizedUserIds = members.map(m => m.userId);
      }
    }

    if (authorizedUserIds.length > 0 && !authorizedUserIds.includes(userId)) {
      res.status(403).json({ error: 'You are not assigned to this approval request' });
      return;
    }
  }

  // ── Resolve group-to-user for assignees (used by multi) ──
  if (hitlEntry.assignees?.groupIds?.length && hitlEntry.assignmentType !== 'group') {
    if (!hitlEntry.assignees.userIds) hitlEntry.assignees.userIds = [];
    for (const groupId of hitlEntry.assignees.groupIds) {
      const members = await db.select({ userId: groupMembers.user_id })
        .from(groupMembers)
        .where(eq(groupMembers.group_id, groupId));
      for (const m of members) {
        if (!hitlEntry.assignees.userIds.includes(m.userId)) {
          hitlEntry.assignees.userIds.push(m.userId);
        }
      }
    }
  }

  // ── Multi-approver logic ──────────────────────────────────────────────────
  if (hitlEntry.assignmentType === 'multi') {
    const currentApprovals: Array<{ userId: string; decision: string; feedback: string }> = hitlEntry.approvals || [];

    // Check if user already voted
    const existing = currentApprovals.find(a => a.userId === userId);
    if (existing) {
      res.status(400).json({ error: 'You have already responded to this request' });
      return;
    }

    // Check if user is in the resolved assignees list
    if (hitlEntry.assignees?.userIds?.length && !hitlEntry.assignees.userIds.includes(userId)) {
      res.status(403).json({ error: 'You are not assigned to this approval request' });
      return;
    }

    currentApprovals.push({ userId, decision, feedback });

    if (decision === 'rejected') {
      // Immediate rejection
      hitlEntry.approvals = currentApprovals;
      await db.update(executions).set({
        status: 'cancelled',
        error: `Rejected by user ${userId}`,
        pending_hitls: JSON.stringify(pendingHitls) as any,
        completed_at: new Date(),
      }).where(eq(executions.id, exec.id));
      res.json({ status: 'rejected', executionId: exec.id });
      return;
    }

    // Count unique approving users
    const approvedCount = currentApprovals.filter(a => a.decision === 'approved').length;
    const required = hitlEntry.requiredApprovals || 1;

    if (approvedCount < required) {
      // Not enough approvals yet — update pending_hitls with the new approval
      hitlEntry.approvals = currentApprovals;
      const otherPending = pendingHitls.filter((h: any) => h.nodeId !== hitlEntry.nodeId);
      await db.update(executions).set({
        pending_hitls: JSON.stringify([...otherPending, hitlEntry]) as any,
      }).where(eq(executions.id, exec.id));
      res.json({ status: 'pending', message: `Approval recorded (${approvedCount}/${required} required)`, executionId: exec.id });
      return;
    }
    // Enough approvals — fall through to resume the flow
  }

  // Use the flow snapshot from when execution started, not the current flow definition
  const snapshot = (exec.output as any)?._flowSnapshot;
  let flowDef: FlowDefinition;
  if (snapshot) {
    flowDef = {
      id: exec.flow_id, name: '', description: '',
      nodes: snapshot.nodes as any, edges: snapshot.edges as any, version: snapshot.version || 1,
      createdAt: '', updatedAt: '',
    };
  } else {
    // Fallback to current flow (legacy executions without snapshot)
    const [flow] = await db.select().from(flows).where(eq(flows.id, exec.flow_id));
    if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }
    flowDef = {
      id: flow.id, name: flow.name, description: flow.description || '',
      nodes: flow.nodes as any, edges: flow.edges as any, version: flow.version,
      createdAt: flow.created_at?.toISOString() || '', updatedAt: flow.updated_at?.toISOString() || '',
      flowContext: flow.flow_context || '',
      groupId: flow.group_id || undefined,
    };
  }

  const executionContext: import('../../../worker/src/executor/engine.js').ExecutionContext = {
    currentExecutionId: exec.id,
    getEndpoint: async (endpointId: string) => {
      const [ep] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
      if (!ep) return null;
      if (ep.group_id && ep.group_id !== flowDef?.groupId) return null;
      return { providerType: ep.provider_type as 'anthropic' | 'openai' | 'litellm', apiKey: ep.api_key, baseUrl: ep.base_url };
    },
    getMCPServer: async (serverId: string) => {
      const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
      if (!server) return null;
      if (server.group_id && server.group_id !== flowDef?.groupId) return null;
      return { id: server.id, name: server.name, url: server.url, tools: server.tools as any[], enabled: server.enabled };
    },
    getEmbeddingProvider: async (providerId: string) => {
      const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
      if (!ep) return null;
      if (ep.group_id && ep.group_id !== flowDef?.groupId) return null;
      return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
    },
    getVectorStore: async (storeId: string) => {
      const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
      if (!vs) return null;
      if (vs.group_id && vs.group_id !== flowDef?.groupId) return null;
      return { name: vs.name, url: vs.url, apiKey: vs.api_key };
    },
    getFlow: async (flowId: string, ancestry?: string[]) => {
      const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
      if (!flow) return null;
      if (ancestry?.includes(flowId)) {
        throw new Error(`Circular subflow reference detected: ${ancestry.join(' -> ')} -> ${flow.name}`);
      }
      return {
        id: flow.id,
        name: flow.name,
        description: flow.description || '',
        nodes: flow.nodes as any,
        edges: flow.edges as any,
        version: flow.version,
        envVars: flow.env_vars as EnvVarEntry[] | undefined,
        createdAt: flow.created_at?.toISOString() || '',
        updatedAt: flow.updated_at?.toISOString() || '',
      };
    },
    onSubExecution: async (data) => {
      const [subExec] = await db.insert(executions).values({
        flow_id: data.subflowId,
        parent_execution_id: data.parentExecutionId,
        subflow_node_id: data.subflowNodeId,
        subflow_depth: data.depth,
        status: 'running',
        input: data.input,
        started_at: new Date(),
      }).returning();
      return subExec.id;
    },
    completeSubExecution: async (subExecutionId, output, status, error) => {
      await db.update(executions).set({
        status,
        output: output as any,
        error: error || null,
        completed_at: new Date(),
      }).where(eq(executions.id, subExecutionId));
    },
    searchSimilar: async (collectionName, queryEmbedding, topK, minScore) => {
      const store = getStore('qdrant') || getStore('pgvector') || listStores().length > 0 ? getStore(listStores()[0]) : undefined;
      if (!store) return [];
      return store.search(collectionName, queryEmbedding, topK, minScore);
    },
    getGlobalContext: async () => {
      const [row] = await db.select().from(agentStore).where(eq(agentStore.key, 'global_context')).limit(1);
      return (row?.value as string) || '';
    },
    getGroupContext: async (groupId: string) => {
      if (!groupId) return '';
      const [row] = await db.select({ context: groups.context }).from(groups).where(eq(groups.id, groupId)).limit(1);
      return row?.context || '';
    },
    getAgentContexts: async (contextIds: string[]) => {
      if (!contextIds?.length) return [];
      const rows = await db.select().from(agentContexts).where(inArray(agentContexts.id, contextIds));
      return rows.map(r => ({ title: r.title, content: r.content }));
    },
    getSecret: async (secretName: string, options?: { scope?: 'app' | 'group' | 'flow' }) => {
      const { secrets: secretsTable } = await import('../db/schema.js');
      const { and, eq } = await import('drizzle-orm');
      const scope = options?.scope || 'app';
      const [secret] = await db.select().from(secretsTable).where(
        and(eq(secretsTable.name, secretName), eq(secretsTable.scope, scope))
      ).limit(1);
      if (!secret || !secret.encrypted_value || !secret.encryption_iv || !secret.encryption_tag) return null;
      const { decrypt } = await import('../utils/encryption.js');
      return decrypt(secret.encrypted_value, secret.encryption_iv, secret.encryption_tag, secret.key_version);
    },
    getCyberArkSecret: async (variableId: string) => {
      const { getSecret: conjurGetSecret } = await import('../services/cyberark.js');
      const { secretVaults: vaultsTable, groupVaultConfig: gvcTable } = await import('../db/schema.js');
      const { eq } = await import('drizzle-orm');
      let vaultId: string | undefined;
      if (flowDef?.groupId) {
        const [gvc] = await db.select({ vaultId: gvcTable.vault_id }).from(gvcTable).where(eq(gvcTable.group_id, flowDef.groupId)).limit(1);
        if (gvc) vaultId = gvc.vaultId;
      }
      const vaultCondition = vaultId ? eq(vaultsTable.id, vaultId) : eq(vaultsTable.is_connected, true);
      const [vault] = await db.select().from(vaultsTable).where(vaultCondition).limit(1);
      if (!vault) return null;
      const keyParts = vault.api_key.split(':');
      const { decrypt } = await import('../utils/encryption.js');
      const apiKey = await decrypt(keyParts[0], keyParts[1], keyParts[2], parseInt(keyParts[3]));
      return conjurGetSecret({
        baseUrl: vault.base_url,
        account: vault.account,
        login: vault.login,
        apiKey,
        caCert: vault.ca_cert || undefined,
        selfHosted: vault.self_hosted,
      }, variableId);
    },
    setSecret: (name: string, value: string) => {
      secretStore.set(name, value);
    },
    logSecretAccess: (entry: { name: string; action: string; source: string }) => {
      db.insert(secretAccessLog).values({
        action: entry.action,
        metadata: { secretName: entry.name, source: entry.source, executionId: flowDef?.id },
        created_at: new Date(),
      }).catch(() => {});
    },
    flowNodes: flowDef.nodes as any,
    flowEdges: flowDef.edges as any,
    sandboxExecutionId: executionId,
    sandboxEnv: (exec.input as any)?.__env || {},
  };

  const executor = new FlowExecutor();
  const savedOutputs = hitlEntry.savedOutputs || {};
  const mergedInput = { ...(exec.input || {}), _approved: true, _feedback: feedback, _decision: decision, ...userData };

  try {
    const persistStep = async (_nodeId: string, event: SSEEvent) => {
      const data = event.data;
      const hierarchy = event.hierarchy || (data.hierarchy as { path: string; depth: number } | undefined);
      const prefix = hierarchy ? hierarchy.path.replace(/->/g, ':') + ':' : '';
      const resolvedNodeId = (data.nodeId as string) || _nodeId;
      const hierarchicalNodeId = prefix ? `${prefix}${resolvedNodeId}` : resolvedNodeId;
      const resolvedNodeType = (data.nodeType as string) || '';
      const iter = (data as any).iteration ?? 0;
      try {
        if (event.type === 'step.started') {
          // Complete any existing running rows for this node (e.g., from a prior HITL pause)
          await db.update(executionSteps).set({ status: 'completed', completed_at: new Date() })
            .where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, hierarchicalNodeId), eq(executionSteps.status, 'running')));
          // Upsert: update existing row for this (exec, node, iteration) or insert new
          const [existing] = await db.select({ id: executionSteps.id })
            .from(executionSteps)
            .where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, hierarchicalNodeId), eq(executionSteps.iteration, iter)))
            .limit(1);
          if (existing) {
            await db.update(executionSteps).set({
              status: 'running', input: data.input as any, started_at: new Date(),
              hierarchy: hierarchy as any || null,
            }).where(eq(executionSteps.id, existing.id));
          } else {
            await db.insert(executionSteps).values({
              execution_id: exec.id, node_id: hierarchicalNodeId, node_type: resolvedNodeType,
              node_label: data.nodeLabel as string | null, iteration: iter,
              status: 'running', input: data.input as any, started_at: new Date(),
              hierarchy: hierarchy as any || null,
            });
          }
        } else if (event.type === 'step.completed') {
          await db.update(executionSteps).set({
            status: 'completed', output: data.output as any, completed_at: new Date(),
            hierarchy: hierarchy as any || null,
          }).where(and(
            eq(executionSteps.execution_id, exec.id),
            eq(executionSteps.node_id, hierarchicalNodeId),
            eq(executionSteps.iteration, iter),
          ));
        } else if (event.type === 'step.failed') {
          await db.update(executionSteps).set({
            status: 'failed', error: data.error as string, completed_at: new Date(),
            hierarchy: hierarchy as any || null,
          }).where(and(
            eq(executionSteps.execution_id, exec.id),
            eq(executionSteps.node_id, hierarchicalNodeId),
            eq(executionSteps.iteration, iter),
          ));
        }
      } catch (e) { logger.error({ error: String(e), executionId: exec.id, nodeId: hierarchicalNodeId }, 'Failed to persist step'); }
    };
    const result = await executor.execute(
      flowDef,
      mergedInput,
      persistStep,
      executionContext,
      { replayFrom: hitlEntry.nodeId, replayOutputs: savedOutputs, inputOverride: mergedInput, initialIteration: (exec.output as any)?._nextIteration ?? 1 },
    );

    // Calculate total paused time (if any)
    const prevPausedAt = (exec.output as any)?._pausedAt;
    const prevPausedTotal = (exec.output as any)?._pausedTotal || 0;
    const pausedTotal = prevPausedAt ? prevPausedTotal + (Date.now() - prevPausedAt) : prevPausedTotal;

    // Success — no more HITLs hit. Mark execution as completed (UPDATE, don't create new).
    await db
      .update(executions)
      .set({
        status: 'completed',
        output: { ...(result.output as object), _pausedTotal: pausedTotal } as any,
        pending_hitls: JSON.stringify([]) as any,
        completed_at: new Date(),
      })
      .where(eq(executions.id, exec.id));

      res.json({ status: 'completed', executionId: exec.id, output: result.output });
    } catch (err) {
      if (err instanceof HitlPauseError) {
        // Another HITL was hit — add to pending list, set back to awaiting_approval
        const stillPending = pendingHitls.filter((h: any) => h.nodeId !== hitlEntry.nodeId);
        const newHitls = [...stillPending, {
          nodeId: err.nodeId, prompt: err.prompt, buttons: err.buttons,
          savedOutputs: err.savedOutputs,
          assignmentType: err.assignmentType,
          assignees: err.assignees,
          requiredApprovals: err.requiredApprovals,
          assignedGroupId: err.assignedGroupId,
          assignedUserId: err.assignedUserId,
          assignedRoleId: err.assignedRoleId,
        }];
        const currentIter = (exec.output as any)?._nextIteration ?? 1;
        const prevPausedAt2 = (exec.output as any)?._pausedAt;
      const prevPausedTotal2 = (exec.output as any)?._pausedTotal || 0;
      const addPause2 = prevPausedAt2 ? (Date.now() - prevPausedAt2) : 0;
      await db
        .update(executions)
        .set({
          status: 'awaiting_approval',
            output: { ...err.savedOutputs, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _pausedTotal: prevPausedTotal2 + addPause2, _pausedAt: Date.now(), _nextIteration: currentIter + 1 } as any,
          pending_hitls: JSON.stringify(newHitls) as any,
        })
        .where(eq(executions.id, exec.id));

      res.json({ status: 'awaiting_approval', executionId: exec.id, message: 'Another HITL node requires approval' });
      return;
    }

    // Handle FlowStopError or any other error
    const error = err instanceof Error ? err.message : String(err);
    const isCancelled = err instanceof FlowStopError;
    await db
      .update(executions)
      .set({
        status: isCancelled ? 'cancelled' : 'failed',
        error,
        completed_at: new Date(),
      })
      .where(eq(executions.id, exec.id));
    res.status(500).json({ status: isCancelled ? 'cancelled' : 'failed', error });
  }
}));

// ── DELETE /api/executions/:executionId — delete an execution ──────────────────

router.delete('/executions/:executionId', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  // Delete steps first (FK constraint)
  await db.delete(executionSteps).where(eq(executionSteps.execution_id, executionId));
  await db.delete(executions).where(eq(executions.id, executionId));

  res.json({ status: 'deleted' });
}));

// ── POST /api/executions/:executionId/reject — reject HITL ──────────────────────

router.post('/executions/:executionId/reject', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  await db.update(executions)
    .set({ status: 'cancelled', error: 'Rejected by user', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'rejected' });
}));

// ── GET /api/flows/:flowId/executions — list past executions ───────────────────

router.get(
  '/flows/:flowId/executions',
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const [result, countResult] = await Promise.all([
      db.select().from(executions).where(eq(executions.flow_id, flowId)).orderBy(desc(executions.created_at)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(executions).where(eq(executions.flow_id, flowId)),
    ]);
    // Filter out debug runs
    const filtered = result.filter((r: any) => !r.input?._debug);
    res.json({ data: filtered, total: Number(countResult[0].count), limit, offset });
  }),
);

// ── GET /api/executions/:executionId — single execution with steps ────────────

router.get(
  '/executions/:executionId',
  asyncHandler(async (req, res) => {
    const executionId = req.params.executionId as string;
    const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
    if (!exec) { res.status(404).json({ message: 'Execution not found' }); return; }
    const steps = await db.select().from(executionSteps).where(eq(executionSteps.execution_id, executionId)).orderBy(executionSteps.started_at);
    res.json({ ...exec, steps });
  }),
);

// ── GET /api/flows/:flowId/executions/:executionId — execution with steps ──────

router.get(
  '/flows/:flowId/executions/:executionId',
  asyncHandler(async (req, res) => {
    const executionId = req.params.executionId as string;

    const [exec] = await db
      .select()
      .from(executions)
      .where(eq(executions.id, executionId));
    if (!exec) {
      res.status(404).json({ message: 'Execution not found' });
      return;
    }

    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.execution_id, executionId))
      .orderBy(executionSteps.started_at);

    res.json({ ...exec, steps });
  }),
);

export default router;
