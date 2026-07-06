import { describe, it, expect } from 'vitest';
import { BASH_TOOL_DEFINITION, BASH_SANDBOX_SYSTEM_PROMPT } from '../tools/bash.js';

describe('BASH_TOOL_DEFINITION', () => {
  it('has the correct name', () => {
    expect(BASH_TOOL_DEFINITION.name).toBe('bash');
  });

  it('has a non-empty description', () => {
    expect(BASH_TOOL_DEFINITION.description).toBeTruthy();
    expect(BASH_TOOL_DEFINITION.description.length).toBeGreaterThan(0);
  });

  it('has input_schema with type object', () => {
    expect(BASH_TOOL_DEFINITION.input_schema.type).toBe('object');
  });

  it('has command, timeout, workdir in properties', () => {
    const props = BASH_TOOL_DEFINITION.input_schema.properties;
    expect(props).toHaveProperty('command');
    expect(props).toHaveProperty('timeout');
    expect(props).toHaveProperty('workdir');
  });

  it('command property is a string', () => {
    expect(BASH_TOOL_DEFINITION.input_schema.properties.command.type).toBe('string');
  });

  it('timeout property is a number', () => {
    expect(BASH_TOOL_DEFINITION.input_schema.properties.timeout.type).toBe('number');
  });

  it('workdir property is a string', () => {
    expect(BASH_TOOL_DEFINITION.input_schema.properties.workdir.type).toBe('string');
  });

  it('requires command', () => {
    expect(BASH_TOOL_DEFINITION.input_schema.required).toEqual(['command']);
  });

  it('has a name distinct from built-in tools', () => {
    expect(BASH_TOOL_DEFINITION.name).not.toMatch(/^store_/);
    expect(BASH_TOOL_DEFINITION.name).not.toBe('now');
    expect(BASH_TOOL_DEFINITION.name).not.toBe('uuid');
    expect(BASH_TOOL_DEFINITION.name).not.toBe('log');
  });
});

describe('BASH_SANDBOX_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toBeTruthy();
    expect(BASH_SANDBOX_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains key word HOME', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('HOME');
  });

  it('contains key word TMPDIR', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('TMPDIR');
  });

  it('contains key word git', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('git');
  });

  it('contains key phrase bash tool', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toMatch(/bash tool/i);
  });

  it('mentions sandbox isolation', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toMatch(/isolated/i);
  });

  it('mentions environment variables for tokens', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('environment variables');
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('$GH_TOKEN');
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('$GITLAB_TOKEN');
  });

  it('describes filesystem rules', () => {
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toMatch(/read-only/i);
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('$HOME');
    expect(BASH_SANDBOX_SYSTEM_PROMPT).toContain('$TMPDIR');
  });
});
