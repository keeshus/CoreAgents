-- Update roles with domain-specific permissions
UPDATE roles SET
  permissions = ARRAY['admin','flow:create','flow:edit','flow:delete','endpoint:read','endpoint:write','mcp:read','mcp:write','embedding:read','embedding:write','store:read','store:write','document:write','knowledge:write','chat:create','execution:approve'],
  description = 'Full system access'
WHERE name = 'admin';

UPDATE roles SET
  permissions = ARRAY['flow:create','flow:edit','execution:approve','endpoint:read','mcp:read','embedding:read','store:read','document:write','knowledge:write','chat:create'],
  description = 'Can create and edit flows'
WHERE name = 'editor';

UPDATE roles SET
  permissions = ARRAY['execution:approve'],
  description = 'Can approve Human-in-the-Loop requests'
WHERE name = 'viewer';
