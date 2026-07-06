import { Router } from 'express';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { mcpServers, groupMembers } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

async function checkGroupAdmin(userId: string, groupId: string): Promise<boolean> {
  const [member] = await db.select()
    .from(groupMembers)
    .where(and(
      eq(groupMembers.user_id, userId),
      eq(groupMembers.group_id, groupId),
      eq(groupMembers.role, 'admin'),
    ))
    .limit(1);
  return !!member;
}

// GET /api/mcp-servers — list all MCP servers
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAdmin = req.user?.permissions?.includes('admin');
    const conditions: any[] = [];

    if (!isAdmin) {
      const userGroups = await db.select({ groupId: groupMembers.group_id })
        .from(groupMembers)
        .where(eq(groupMembers.user_id, req.user!.userId));
      const groupIds = userGroups.map(g => g.groupId);

      if (groupIds.length > 0) {
        conditions.push(
          or(
            isNull(mcpServers.group_id),
            inArray(mcpServers.group_id, groupIds),
          ),
        );
      } else {
        conditions.push(isNull(mcpServers.group_id));
      }
    }

    const result = conditions.length > 0
      ? await db.select().from(mcpServers).where(and(...conditions))
      : await db.select().from(mcpServers);

    res.json(result);
  }),
);

// GET /api/mcp-servers/:id — get single server
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    const isAdmin = req.user?.permissions?.includes('admin');
    if (!isAdmin && result[0].group_id) {
      const userGroups = await db.select({ groupId: groupMembers.group_id })
        .from(groupMembers)
        .where(eq(groupMembers.user_id, req.user!.userId));
      const groupIds = userGroups.map(g => g.groupId);
      if (!groupIds.includes(result[0].group_id)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json(result[0]);
  }),
);

// POST /api/mcp-servers — create server
router.post(
  '/',
  requirePermission('mcp:write', 'mcp:write_group'),
  asyncHandler(async (req, res) => {
    const { name, url, tools = [], enabled = true, groupId } = req.body;

    if (!name || !url) {
      res.status(400).json({ error: 'name and url are required' });
      return;
    }

    if (groupId) {
      const isAdmin = req.user!.permissions?.includes('admin');
      const isGroupAdmin = await checkGroupAdmin(req.user!.userId, groupId);
      if (!isAdmin && !isGroupAdmin) {
        res.status(403).json({ error: 'Only group admins can create group-scoped MCP servers' });
        return;
      }
    }

    const result = await db
      .insert(mcpServers)
      .values({
        name,
        url,
        tools,
        enabled,
        group_id: groupId || null,
      })
      .returning();

    res.status(201).json(result[0]);
  }),
);

// PUT /api/mcp-servers/:id — update server
router.put(
  '/:id',
  requirePermission('mcp:write', 'mcp:write_group'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, url, tools, enabled } = req.body;

    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    const isAdmin = req.user!.permissions?.includes('admin');
    if (existing.group_id) {
      if (!isAdmin) {
        const isGroupAdmin = await checkGroupAdmin(req.user!.userId, existing.group_id);
        if (!isGroupAdmin) {
          res.status(403).json({ error: 'Only group admins can modify group-scoped MCP servers' });
          return;
        }
      }
    } else {
      if (!isAdmin && !req.user!.permissions.includes('mcp:write')) {
        res.status(403).json({ error: 'Insufficient permissions to modify app-wide MCP servers' });
        return;
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (tools !== undefined) updateData.tools = tools;
    if (enabled !== undefined) updateData.enabled = enabled;

    const result = await db.update(mcpServers).set(updateData).where(eq(mcpServers.id, id)).returning();
    res.json(result[0]);
  }),
);

// DELETE /api/mcp-servers/:id — delete server
router.delete(
  '/:id',
  requirePermission('mcp:write', 'mcp:write_group'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    const isAdmin = req.user!.permissions?.includes('admin');
    if (existing.group_id) {
      if (!isAdmin) {
        const isGroupAdmin = await checkGroupAdmin(req.user!.userId, existing.group_id);
        if (!isGroupAdmin) {
          res.status(403).json({ error: 'Only group admins can delete group-scoped MCP servers' });
          return;
        }
      }
    } else {
      if (!isAdmin && !req.user!.permissions.includes('mcp:write')) {
        res.status(403).json({ error: 'Insufficient permissions to delete app-wide MCP servers' });
        return;
      }
    }

    await db.delete(mcpServers).where(eq(mcpServers.id, id));
    res.status(204).send();
  }),
);

// POST /api/mcp-servers/:id/refresh — Refresh tools list from server
router.post(
  '/:id/refresh',
  requirePermission('mcp:write', 'mcp:write_group'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id));
    if (!server) {
      res.status(404).json({ message: 'MCP server not found' });
      return;
    }

    const isAdmin = req.user!.permissions?.includes('admin');
    if (server.group_id) {
      if (!isAdmin) {
        const isGroupAdmin = await checkGroupAdmin(req.user!.userId, server.group_id);
        if (!isGroupAdmin) {
          res.status(403).json({ error: 'Only group admins can refresh group-scoped MCP servers' });
          return;
        }
      }
    } else {
      if (!isAdmin && !req.user!.permissions.includes('mcp:write')) {
        res.status(403).json({ error: 'Insufficient permissions to refresh app-wide MCP servers' });
        return;
      }
    }

    try {
      const { mcpHub } = await import('../../../worker/src/tools/hub.js');

      if (mcpHub.isConnected(server.id)) {
        await mcpHub.disconnect(server.id);
      }
      await mcpHub.connect({
        id: server.id,
        name: server.name,
        url: server.url,
        enabled: server.enabled,
      });

      const tools = await mcpHub.listTools(server.id);

      const [updated] = await db.update(mcpServers)
        .set({ tools: tools as any, updated_at: new Date() })
        .where(eq(mcpServers.id, server.id))
        .returning();

      res.json({ ...updated, message: `Refreshed: ${tools.length} tools found` });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `Failed to refresh tools: ${error}` });
    }
  }),
);

export default router;
