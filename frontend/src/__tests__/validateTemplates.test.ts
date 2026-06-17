import { describe, it, expect } from 'vitest';
import { validateTemplates, buildAvailablePaths } from '@/lib/validateTemplates';

const mockNodes = [
  { id: 'n1', data: { label: 'Trigger', type: 'trigger', config: {} } },
  { id: 'n2', data: { label: 'Summarizer', type: 'llm-agent', config: {} } },
];

const labels = ['Trigger', 'Summarizer'];

describe('buildAvailablePaths', () => {
  it('returns correct paths for trigger node', () => {
    const paths = buildAvailablePaths(['Trigger'], [mockNodes[0]]);
    expect(paths.has('input.Trigger')).toBe(true);
    expect(paths.has('input.Trigger.message')).toBe(true);
  });

  it('returns correct paths for llm-agent', () => {
    const paths = buildAvailablePaths(['Summarizer'], [mockNodes[1]]);
    expect(paths.has('input.Summarizer')).toBe(true);
    expect(paths.has('input.Summarizer.content')).toBe(true);
  });
});

describe('validateTemplates', () => {
  it('passes valid templates', () => {
    expect(validateTemplates('{{input.Trigger.message}}', labels, mockNodes)).toHaveLength(0);
  });

  it('passes valid label-only templates', () => {
    expect(validateTemplates('{{input.Trigger}}', labels, mockNodes)).toHaveLength(0);
  });

  it('flags unknown node labels', () => {
    const errors = validateTemplates('{{input.Nonexistent.content}}', labels, mockNodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Nonexistent');
  });

  it('flags unknown fields', () => {
    const errors = validateTemplates('{{input.Trigger.nonexistent}}', labels, mockNodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent');
  });

  it('provides suggestions for typos', () => {
    const errors = validateTemplates('{{input.Trriger.message}}', labels, mockNodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].suggestions.length).toBeGreaterThan(0);
  });

  it('handles strings with no templates', () => {
    expect(validateTemplates('just plain text', labels, mockNodes)).toHaveLength(0);
  });

  it('handles empty strings', () => {
    expect(validateTemplates('', labels, mockNodes)).toHaveLength(0);
  });
});
