import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const executionStepStatusEnum = pgEnum('execution_step_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const providerTypeEnum = pgEnum('provider_type', [
  'anthropic',
  'openai',
  'litellm',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const flows = pgTable('flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  nodes: jsonb('nodes').notNull().default('[]'),
  edges: jsonb('edges').notNull().default('[]'),
  version: integer('version').notNull().default(1),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const flowVersions = pgTable('flow_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  flow_id: uuid('flow_id')
    .notNull()
    .references(() => flows.id),
  nodes: jsonb('nodes').notNull(),
  edges: jsonb('edges').notNull(),
  version: integer('version').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  flow_id: uuid('flow_id')
    .notNull()
    .references(() => flows.id),
  status: executionStatusEnum('status').notNull().default('pending'),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  error: text('error'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const executionSteps = pgTable('execution_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  execution_id: uuid('execution_id')
    .notNull()
    .references(() => executions.id),
  node_id: text('node_id').notNull(),
  node_type: text('node_type').notNull(),
  status: executionStepStatusEnum('status').notNull().default('pending'),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
});

export const llmEndpoints = pgTable('llm_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  provider_type: providerTypeEnum('provider_type').notNull(),
  base_url: text('base_url'),
  api_key: text('api_key').notNull(),
  default_model: text('default_model').notNull(),
  models: jsonb('models').notNull().default('[]'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  tools: jsonb('tools').notNull().default('[]'),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  flow_id: uuid('flow_id')
    .notNull()
    .references(() => flows.id),
  title: text('title'),
  metadata: jsonb('metadata').notNull().default('{}'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: uuid('session_id')
    .notNull()
    .references(() => chatSessions.id),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').notNull().default('{}'),
  collection_name: text('collection_name').notNull().default('default'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  document_id: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  chunk_index: integer('chunk_index').notNull(),
  chunk_text: text('chunk_text').notNull(),
  embedding: jsonb('embedding').notNull().default('[]'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const embeddingProviders = pgTable('embedding_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  provider_type: providerTypeEnum('provider_type').notNull(),
  base_url: text('base_url'),
  api_key: text('api_key').notNull(),
  model: text('model').notNull().default('text-embedding-ada-002'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const vectorStores = pgTable('vector_stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  store_type: text('store_type').notNull().default('qdrant'),
  url: text('url').notNull(),
  api_key: text('api_key'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const agentStore = pgTable('agent_store', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default('null'),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
