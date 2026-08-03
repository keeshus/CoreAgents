/**
 * Co-Pilot tool permission map: tool name -> required permission.
 * Mirrors the backend requirePermission() gates so the panel only exposes
 * tools the current user can actually use. Shared between the assistant
 * context (runtime filtering) and unit tests (no drift).
 */
export const TOOL_PERMS: Record<string, string> = {
  // Endpoints
  list_endpoints: 'endpoint:read', get_endpoint: 'endpoint:read', get_default_endpoint: 'endpoint:read',
  create_endpoint: 'endpoint:write', delete_endpoint: 'endpoint:write', update_endpoint: 'endpoint:write',
  // MCP servers
  list_mcp_servers: 'mcp:read', get_mcp_server: 'mcp:read',
  create_mcp_server: 'mcp:write', delete_mcp_server: 'mcp:write', refresh_mcp_tools: 'mcp:write', update_mcp_server: 'mcp:write',
  // Embedding providers
  list_embedding_providers: 'embedding:read', get_embedding_provider: 'embedding:read',
  create_embedding_provider: 'embedding:write', delete_embedding_provider: 'embedding:write', update_embedding_provider: 'embedding:write',
  // Vector stores
  list_vector_stores: 'store:read', get_vector_store: 'store:read', list_collections: 'store:read',
  create_vector_store: 'store:write', delete_vector_store: 'store:write', update_vector_store: 'store:write', refresh_collections: 'store:write',
  // Users / roles / admin
  list_users: 'admin', create_user: 'admin', delete_user: 'admin', update_user_role: 'admin',
  list_roles: 'admin', seed_roles: 'admin', set_user_groups: 'admin', update_group_member_role: 'admin',
  list_executions: 'admin',
  // Env vars (app-level)
  list_env_vars: 'admin', update_env_vars: 'admin', get_group_env_vars: 'admin', set_group_env_vars: 'admin',
  // Global context / SSO
  get_global_context: 'admin', update_global_context: 'admin',
  get_sso_config: 'admin', update_sso_config: 'admin',
  // Flows
  create_flow: 'flow:create', execute_flow: 'flow:create',
  update_flow: 'flow:edit', save_flow: 'flow:edit', validate_flow: 'flow:edit',
  delete_flow: 'flow:delete',
  // Agent contexts
  create_agent_context: 'flow:create', update_agent_context: 'flow:edit', delete_agent_context: 'flow:delete',
  // Executions / approvals
  get_pending_approvals: 'execution:approve', approve_execution: 'execution:approve', reject_execution: 'execution:approve',
  decide_assignment: 'execution:approve', delete_execution: 'execution:approve', get_execution_details: 'execution:approve',
  cancel_execution: 'flow:edit',
  // Secrets
  create_secret: 'secrets:write', update_secret: 'secrets:write', delete_secret: 'secrets:write',
  reveal_secret: 'secrets:read', get_secret_audit_log: 'secrets:audit',
  rotate_key: 'secrets:rotate', re_encrypt_secrets: 'secrets:rotate',
  // Secret vaults
  list_vaults: 'vaults:read', get_vault: 'vaults:read',
  create_vault: 'vaults:write', update_vault: 'vaults:write', delete_vault: 'vaults:write', test_vault_connection: 'vaults:write',
  set_group_vault: 'vaults:write',
  // Groups
  list_groups: 'group:read',
  create_group: 'group:write', update_group: 'group:write', delete_group: 'group:write',
  add_group_member: 'group:write', remove_group_member: 'group:write',
  // Knowledge
  upload_knowledge_document: 'knowledge:write', delete_knowledge_collection: 'knowledge:write', delete_knowledge_document: 'knowledge:write',
  // Chat sessions
  create_chat_session: 'chat:create', send_chat_message: 'chat:create', delete_chat_session: 'flow:edit',
  // Chat API / webhooks
  get_chat_api_deployment: 'flow:edit', update_chat_api_deployment: 'flow:edit',
  list_chat_api_keys: 'flow:edit', create_chat_api_key: 'flow:edit', delete_chat_api_key: 'flow:edit',
  get_webhook_deployment: 'flow:edit', update_webhook_deployment: 'flow:edit',
  renew_webhook_api_key: 'flow:edit', revoke_webhook_api_key: 'flow:edit',
};

/** Filter a list of tool names to those the user's permissions allow. */
export function filterToolsByPermission(toolNames: string[], userPerms: string[] | undefined): string[] {
  const perms = userPerms || [];
  return toolNames.filter(name => !TOOL_PERMS[name] || perms.includes(TOOL_PERMS[name]));
}
