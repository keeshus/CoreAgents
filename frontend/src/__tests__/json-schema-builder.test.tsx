import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonSchemaBuilder } from '@/components/flow/config/JsonSchemaBuilder';

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
  required: ['name'],
});

function Harness({ initial = '', onChange = () => {} }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <JsonSchemaBuilder
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('JsonSchemaBuilder', () => {
  it('renders property rows parsed from the schema value', () => {
    render(<Harness initial={SCHEMA} />);
    const nameInput = screen.getByTestId('schema-prop-0-name') as HTMLInputElement;
    const ageInput = screen.getByTestId('schema-prop-1-name') as HTMLInputElement;
    expect(nameInput.value).toBe('name');
    expect(ageInput.value).toBe('age');
    expect((screen.getByTestId('schema-prop-0-type') as HTMLSelectElement).value).toBe('string');
    expect((screen.getByTestId('schema-prop-1-type') as HTMLSelectElement).value).toBe('number');
    expect((screen.getByTestId('schema-prop-0-required') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('schema-prop-1-required') as HTMLInputElement).checked).toBe(false);
  });

  it('emits a regenerated schema when a property is added', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByTestId('json-schema-add-prop'));
    fireEvent.change(screen.getByTestId('schema-prop-0-name'), { target: { value: 'message' } });
    fireEvent.change(screen.getByTestId('schema-prop-0-type'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByTestId('schema-prop-0-required'));
    expect(onChange).toHaveBeenLastCalledWith(
      JSON.stringify(
        {
          type: 'object',
          properties: { message: { type: 'boolean' } },
          required: ['message'],
        },
        null,
        2
      )
    );
  });

  it('removes a property row and re-emits', () => {
    const onChange = vi.fn();
    render(<Harness initial={SCHEMA} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-prop-0-remove'));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
    const parsed = JSON.parse(lastCall);
    expect(parsed.properties).not.toHaveProperty('name');
    expect(parsed.properties).toHaveProperty('age');
    expect(parsed.required ?? []).toEqual([]);
  });

  it('toggles raw JSON mode and reports invalid JSON', () => {
    render(<Harness initial="not-json" />);
    expect(screen.getByTestId('json-schema-raw-input')).toBeInTheDocument();
    expect(screen.getByTestId('json-schema-error')).toBeInTheDocument();
  });

  it('switches between builder and JSON modes', () => {
    render(<Harness initial={SCHEMA} />);
    fireEvent.click(screen.getByTestId('json-schema-mode-raw'));
    const raw = screen.getByTestId('json-schema-raw-input') as HTMLTextAreaElement;
    expect(raw.value).toBe(SCHEMA);
    fireEvent.click(screen.getByTestId('json-schema-mode-builder'));
    expect(screen.getByTestId('schema-prop-0-name')).toBeInTheDocument();
  });

  it('preserves extra root keys and nested property structure', () => {
    const onChange = vi.fn();
    const schema = JSON.stringify({
      type: 'object',
      title: 'My schema',
      additionalProperties: false,
      properties: {
        nested: { type: 'object', properties: { deep: { type: 'string' } } },
      },
      required: [],
    });
    render(<Harness initial={schema} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-prop-0-required'));
    const lastCall = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0]);
    expect(lastCall.title).toBe('My schema');
    expect(lastCall.additionalProperties).toBe(false);
    expect(lastCall.properties.nested.properties.deep.type).toBe('string');
  });

  it('round-trips descriptions', () => {
    const onChange = vi.fn();
    render(<Harness initial={SCHEMA} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('schema-prop-0-desc'), {
      target: { value: 'The user name' },
    });
    const lastCall = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0]);
    expect(lastCall.properties.name.description).toBe('The user name');
  });
});
