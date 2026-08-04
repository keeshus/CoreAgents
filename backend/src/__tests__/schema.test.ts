import { describe, it, expect } from 'vitest';

const DRZZLE_NAME = Symbol.for('drizzle:Name');

describe('database schema', () => {
  async function loadSchema() {
    return await import('orchestream-ai-shared');
  }

  describe('table exports', () => {
    it('exports flows table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.flows).toBeDefined();
      expect((schema.flows as any)[DRZZLE_NAME]).toBe('flows');
    });

    it('exports users table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.users).toBeDefined();
      expect((schema.users as any)[DRZZLE_NAME]).toBe('users');
    });

    it('exports groups table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.groups).toBeDefined();
      expect((schema.groups as any)[DRZZLE_NAME]).toBe('groups');
    });

    it('exports apiKeys table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.apiKeys).toBeDefined();
      expect((schema.apiKeys as any)[DRZZLE_NAME]).toBe('api_keys');
    });

    it('exports chatApiKeys table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.chatApiKeys).toBeDefined();
      expect((schema.chatApiKeys as any)[DRZZLE_NAME]).toBe('chat_api_keys');
    });

    it('exports chatApiDeployments table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.chatApiDeployments).toBeDefined();
      expect((schema.chatApiDeployments as any)[DRZZLE_NAME]).toBe('chat_api_deployments');
    });

    it('exports executions table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.executions).toBeDefined();
      expect((schema.executions as any)[DRZZLE_NAME]).toBe('executions');
    });

    it('exports apiDeployments table with correct name', async () => {
      const schema = await loadSchema();
      expect(schema.apiDeployments).toBeDefined();
      expect((schema.apiDeployments as any)[DRZZLE_NAME]).toBe('api_deployments');
    });
  });

  describe('enum exports', () => {
    it('exports executionStatusEnum', async () => {
      const schema = await loadSchema();
      expect(schema.executionStatusEnum).toBeDefined();
    });

    it('exports executionStepStatusEnum', async () => {
      const schema = await loadSchema();
      expect(schema.executionStepStatusEnum).toBeDefined();
    });

    it('exports providerTypeEnum', async () => {
      const schema = await loadSchema();
      expect(schema.providerTypeEnum).toBeDefined();
    });

    it('exports messageRoleEnum', async () => {
      const schema = await loadSchema();
      expect(schema.messageRoleEnum).toBeDefined();
    });
  });

  describe('column definitions', () => {
    it('flows table has expected columns', async () => {
      const schema = await loadSchema();
      const flow = schema.flows;
      expect(typeof flow.id).toBe('object');
      expect(typeof flow.name).toBe('object');
      expect(typeof flow.description).toBe('object');
      expect(typeof flow.nodes).toBe('object');
      expect(typeof flow.edges).toBe('object');
      expect(typeof flow.version).toBe('object');
      expect(typeof flow.created_by).toBe('object');
      expect(typeof flow.group_id).toBe('object');
      expect(typeof flow.is_subflow).toBe('object');
      expect(typeof flow.created_at).toBe('object');
      expect(typeof flow.updated_at).toBe('object');
    });

    it('users table has expected columns', async () => {
      const schema = await loadSchema();
      const users = schema.users;
      expect(typeof users.id).toBe('object');
      expect(typeof users.email).toBe('object');
      expect(typeof users.password_hash).toBe('object');
      expect(typeof users.name).toBe('object');
      expect(typeof users.role_id).toBe('object');
      expect(typeof users.is_active).toBe('object');
      expect(typeof users.created_at).toBe('object');
    });

    it('executions table has expected columns', async () => {
      const schema = await loadSchema();
      const exec = schema.executions;
      expect(typeof exec.id).toBe('object');
      expect(typeof exec.flow_id).toBe('object');
      expect(typeof exec.status).toBe('object');
      expect(typeof exec.input).toBe('object');
      expect(typeof exec.output).toBe('object');
      expect(typeof exec.started_at).toBe('object');
      expect(typeof exec.completed_at).toBe('object');
    });

    it('chatApiDeployments table has expected columns', async () => {
      const schema = await loadSchema();
      const dep = schema.chatApiDeployments;
      expect(typeof dep.id).toBe('object');
      expect(typeof dep.flow_id).toBe('object');
      expect(typeof dep.enabled).toBe('object');
      expect(typeof dep.model_name).toBe('object');
      expect(typeof dep.rate_limit).toBe('object');
    });

    it('chatApiKeys table has expected columns', async () => {
      const schema = await loadSchema();
      const key = schema.chatApiKeys;
      expect(typeof key.id).toBe('object');
      expect(typeof key.flow_id).toBe('object');
      expect(typeof key.label).toBe('object');
      expect(typeof key.key_hash).toBe('object');
      expect(typeof key.key_prefix).toBe('object');
      expect(typeof key.enabled).toBe('object');
      expect(typeof key.created_at).toBe('object');
    });
  });

  describe('backend re-exports match', () => {
    it('backend/src/db/schema re-exports all from orchestream-ai-shared', async () => {
      const backendSchema = await import('../db/schema.js');
      const keys = Object.keys(backendSchema).sort();
      expect(keys.length).toBeGreaterThan(30);
      expect(keys).toContain('flows');
      expect(keys).toContain('users');
      expect(keys).toContain('executions');
      expect(keys).toContain('chatApiKeys');
      expect(keys).toContain('chatApiDeployments');
      expect(keys).toContain('apiDeployments');
      expect(keys).toContain('apiKeys');
    });
  });
});