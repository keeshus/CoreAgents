import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Test requirePermission middleware ───────────────────────────────

describe('requirePermission', () => {
  let requirePermission: any;
  let req: any, res: any, next: any;

  beforeEach(async () => {
    // Dynamic import so env is fresh each test
    vi.resetModules();
    const mod = await import('../middleware/auth.js');
    requirePermission = mod.requirePermission;
    req = { user: null };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('returns 401 if no user on request', () => {
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user lacks the required permission', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'reader', permissions: ['flow:read'] };
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next if user has the required permission', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'admin', permissions: ['flow:create', 'flow:edit'] };
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes if user has any of multiple required permissions', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'editor', permissions: ['flow:edit'] };
    const middleware = requirePermission('flow:create', 'flow:edit');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects if user has none of multiple required permissions', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'reader', permissions: ['flow:read'] };
    const middleware = requirePermission('flow:create', 'flow:delete');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── Test role permissions structure ─────────────────────────────────

describe('role permissions', () => {
  const rolePermissions: Record<string, string[]> = {
    admin: ['admin', 'flow:create', 'flow:edit', 'flow:delete', 'flow:read', 'endpoint:read', 'endpoint:write', 'mcp:read', 'mcp:write', 'embedding:read', 'embedding:write', 'store:read', 'store:write', 'document:write', 'knowledge:write', 'chat:create', 'execution:approve', 'group:read', 'group:write'],
    editor: ['flow:create', 'flow:edit', 'flow:read', 'execution:approve', 'endpoint:read', 'mcp:read', 'embedding:read', 'store:read', 'document:write', 'knowledge:write', 'chat:create', 'group:read'],
    reader: ['execution:approve'],
  };

  it('admin has all permissions', () => {
    const all = ['flow:create', 'flow:edit', 'flow:delete', 'flow:read', 'endpoint:read', 'endpoint:write', 'execution:approve', 'chat:create', 'group:read', 'group:write'];
    for (const perm of all) {
      expect(rolePermissions.admin).toContain(perm);
    }
  });

  it('editor can create and edit flows', () => {
    expect(rolePermissions.editor).toContain('flow:create');
    expect(rolePermissions.editor).toContain('flow:edit');
    expect(rolePermissions.editor).toContain('flow:read');
    expect(rolePermissions.editor).toContain('chat:create');
    expect(rolePermissions.editor).toContain('endpoint:read');
    expect(rolePermissions.editor).toContain('group:read');
    expect(rolePermissions.editor).not.toContain('flow:delete');
    expect(rolePermissions.editor).not.toContain('endpoint:write');
    expect(rolePermissions.editor).not.toContain('group:write');
  });

  it('reader can only approve HITL', () => {
    expect(rolePermissions.reader).toContain('execution:approve');
    expect(rolePermissions.reader).not.toContain('flow:read');
    expect(rolePermissions.reader).not.toContain('flow:create');
    expect(rolePermissions.reader).not.toContain('flow:edit');
    expect(rolePermissions.reader).not.toContain('flow:delete');
    expect(rolePermissions.reader).not.toContain('endpoint:read');
    expect(rolePermissions.reader).not.toContain('endpoint:write');
    expect(rolePermissions.reader).not.toContain('chat:create');
    expect(rolePermissions.reader).not.toContain('group:read');
    expect(rolePermissions.reader).not.toContain('group:write');
  });

  it('only admin can write to settings domains', () => {
    expect(rolePermissions.admin).toContain('endpoint:write');
    expect(rolePermissions.admin).toContain('mcp:write');
    expect(rolePermissions.admin).toContain('embedding:write');
    expect(rolePermissions.admin).toContain('store:write');
    expect(rolePermissions.editor).not.toContain('endpoint:write');
    expect(rolePermissions.reader).not.toContain('endpoint:write');
  });

  it('only admin can delete flows', () => {
    expect(rolePermissions.admin).toContain('flow:delete');
    expect(rolePermissions.editor).not.toContain('flow:delete');
    expect(rolePermissions.reader).not.toContain('flow:delete');
  });
});

// ── Test group-to-role mapping ──────────────────────────────────────

describe('resolveRoleFromGroups', () => {
  // Replicate the updated function from auth.ts (takes pre-resolved groupNames array)
  function resolveRoleFromGroups(
    groupNames: string[],
    adminMapping: string[],
    editorMapping: string[],
  ): string {
    if (groupNames.some(g => adminMapping.includes(g))) return 'admin';
    if (groupNames.some(g => editorMapping.includes(g))) return 'editor';
    return 'reader';
  }

  const adminMapping = ['core-agents-admin', 'admin'];
  const editorMapping = ['core-agents-editor', 'editor'];

  it('returns admin for admin group', () => {
    expect(resolveRoleFromGroups(['core-agents-admin'], adminMapping, editorMapping)).toBe('admin');
    expect(resolveRoleFromGroups(['admin'], adminMapping, editorMapping)).toBe('admin');
  });

  it('returns editor for editor group', () => {
    expect(resolveRoleFromGroups(['core-agents-editor'], adminMapping, editorMapping)).toBe('editor');
    expect(resolveRoleFromGroups(['editor'], adminMapping, editorMapping)).toBe('editor');
  });

  it('returns reader for unknown groups', () => {
    expect(resolveRoleFromGroups(['user', 'approver'], adminMapping, editorMapping)).toBe('reader');
    expect(resolveRoleFromGroups([], adminMapping, editorMapping)).toBe('reader');
  });

  it('returns reader for no groups', () => {
    expect(resolveRoleFromGroups([], adminMapping, editorMapping)).toBe('reader');
  });

  it('admin group takes priority over editor', () => {
    expect(resolveRoleFromGroups(['editor', 'admin'], adminMapping, editorMapping)).toBe('admin');
  });

  it('returns reader when admin/editor mappings are empty', () => {
    expect(resolveRoleFromGroups(['admin'], [], [])).toBe('reader');
    expect(resolveRoleFromGroups(['editor'], [], [])).toBe('reader');
  });
});
