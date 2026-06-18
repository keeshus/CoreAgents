-- Fix editor and viewer role permissions to match the actual application usage
-- Editor: can create/edit flows, approve HITL, read settings
-- Viewer: can only approve HITL (redirected to approvals page, no flow/settings access)

UPDATE roles SET
  permissions = ARRAY['flow:create', 'flow:edit', 'execution:approve', 'settings:read'],
  description = 'Can create and edit flows'
WHERE name = 'editor';

UPDATE roles SET
  permissions = ARRAY['execution:approve'],
  description = 'Can approve Human-in-the-Loop requests'
WHERE name = 'viewer';
