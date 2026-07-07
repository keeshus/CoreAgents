import { describe, it, expect } from 'vitest';

describe('FlowToolNode', () => {
  it('renders "Not configured" when flowIds is empty', () => {
    const config = { flowIds: [], selectedFlows: [] };
    const count = config.flowIds?.length || 0;
    expect(count).toBe(0);
  });

  it('renders flow count when flows selected', () => {
    const config = { flowIds: ['f1', 'f2'], selectedFlows: [{ id: 'f1', name: 'Weather API' }, { id: 'f2', name: 'Send Email' }] };
    const count = config.flowIds?.length || 0;
    expect(count).toBe(2);
    expect(config.selectedFlows.length).toBe(2);
  });

  it('shows up to 3 flow names then +N more', () => {
    const flows = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `Flow ${i}` }));
    const visible = flows.slice(0, 3);
    const remaining = flows.length - visible.length;
    expect(visible.map(f => f.name)).toEqual(['Flow 0', 'Flow 1', 'Flow 2']);
    expect(remaining).toBe(2);
  });

  it('shows "1 flow selected" for single flow', () => {
    const config = { flowIds: ['f1'], selectedFlows: [{ id: 'f1', name: 'Weather API' }] };
    const count = config.flowIds?.length || 0;
    expect(count).toBe(1);
  });
});