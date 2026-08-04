import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'] as const;

const TYPE_OPTIONS = SCHEMA_TYPES.map((t) => ({ value: t, label: t }));

interface JsonSchemaBuilderProps {
  value: string;
  onChange: (schemaJson: string) => void;
  label?: string;
  helpText?: string;
  placeholder?: string;
  rows?: number;
}

interface PropertyRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
  extra: Record<string, any>;
}

interface ParsedSchema {
  root: Record<string, any> | null;
  error: string | null;
}

function parseSchema(value: string): ParsedSchema {
  const trimmed = value.trim();
  if (!trimmed) return { root: { type: 'object', properties: {}, required: [] }, error: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { root: parsed, error: null };
    }
    return { root: null, error: 'Schema must be a JSON object.' };
  } catch (err: any) {
    return { root: null, error: err?.message || 'Invalid JSON' };
  }
}

function rootToRows(root: Record<string, any>): PropertyRow[] {
  const props =
    root.properties && typeof root.properties === 'object' && !Array.isArray(root.properties)
      ? root.properties
      : {};
  const required = Array.isArray(root.required) ? root.required : [];
  return Object.entries(props).map(([name, prop]) => {
    const p = (prop && typeof prop === 'object' && !Array.isArray(prop) ? prop : {}) as Record<string, any>;
    const { type, description, ...extra } = p;
    return {
      name,
      type: typeof type === 'string' ? type : 'string',
      required: required.includes(name),
      description: typeof description === 'string' ? description : '',
      extra,
    };
  });
}

function rowsToSchema(rows: PropertyRow[], rootExtra: Record<string, any>): string {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    properties[name] = {
      ...row.extra,
      type: row.type || 'string',
      ...(row.description.trim() ? { description: row.description.trim() } : {}),
    };
    if (row.required) required.push(name);
  }
  const root: Record<string, any> = {
    ...rootExtra,
    type: 'object',
    properties,
  };
  if (required.length > 0) root.required = required;
  return JSON.stringify(root, null, 2);
}

export function JsonSchemaBuilder({
  value,
  onChange,
  label,
  helpText,
  placeholder = '{"type":"object","properties":{...}}',
  rows: rawRows = 6,
}: JsonSchemaBuilderProps) {
  const [mode, setMode] = useState<'builder' | 'raw'>('builder');
  const parsed = useMemo(() => parseSchema(value), [value]);
  const effectiveMode = mode === 'builder' && !parsed.root ? 'raw' : mode;

  const rootExtra = useMemo(() => {
    if (!parsed.root) return {};
    const { properties, required, type, ...extra } = parsed.root;
    return extra;
  }, [parsed]);

  // Local row state so freshly added (empty-name) rows stay visible while
  // typing, even though they're dropped from the emitted schema. Re-derive
  // from the value prop only when it changed externally (not our own echo).
  const [rows, setRows] = useState<PropertyRow[]>(() =>
    parsed.root ? rootToRows(parsed.root) : []
  );
  const lastDerivedRef = useRef(value);
  useEffect(() => {
    if (value !== lastDerivedRef.current) {
      lastDerivedRef.current = value;
      const p = parseSchema(value);
      if (p.root) setRows(rootToRows(p.root));
    }
  }, [value]);

  const emit = (nextRows: PropertyRow[]) => {
    const schema = rowsToSchema(nextRows, rootExtra);
    lastDerivedRef.current = schema;
    setRows(nextRows);
    onChange(schema);
  };

  const updateRow = (index: number, patch: Partial<PropertyRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    emit(next);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    emit(next);
  };

  const addRow = () => {
    emit([...rows, { name: '', type: 'string', required: false, description: '', extra: {} }]);
  };

  const modeButton = (m: 'builder' | 'raw', testId: string, children: React.ReactNode) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => setMode(m)}
      className={cn(
        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
        effectiveMode === m
          ? 'bg-primary-container text-primary'
          : 'text-on-surface-variant hover:bg-surface-container-high'
      )}
    >
      {children}
    </button>
  );

  return (
    <div data-testid="json-schema-builder" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {modeButton('builder', 'json-schema-mode-builder', (
            <span className="flex items-center gap-1"><Icon name="table_rows" className="text-xs" /> Builder</span>
          ))}
          {modeButton('raw', 'json-schema-mode-raw', (
            <span className="flex items-center gap-1"><Icon name="code" className="text-xs" /> JSON</span>
          ))}
        </div>
        {label && <span className="text-xs font-medium text-on-surface-variant">{label}</span>}
      </div>

      {effectiveMode === 'raw' ? (
        <div>
          <textarea
            data-testid="json-schema-raw-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rawRows}
            className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
          />
          {parsed.error && (
            <p data-testid="json-schema-error" className="mt-1 text-[10px] text-error">
              {parsed.error}
            </p>
          )}
        </div>
      ) : (
        <div className="border border-outline-variant rounded-lg bg-surface overflow-hidden">
          {rows.length === 0 && (
            <p className="px-3 py-2 text-[10px] text-on-surface-variant italic">
              No properties yet — add a field below.
            </p>
          )}
          {rows.map((row, i) => (
            <div
              key={i}
              data-testid={`schema-prop-${i}`}
              className="flex items-center gap-1.5 px-2 py-1.5 border-b border-outline-variant last:border-b-0"
            >
              <input
                data-testid={`schema-prop-${i}-name`}
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                placeholder="Field name"
                className="w-32 min-w-0 rounded border border-outline p-1.5 text-xs bg-surface"
              />
              <select
                data-testid={`schema-prop-${i}-type`}
                value={row.type}
                onChange={(e) => updateRow(i, { type: e.target.value })}
                className="rounded border border-outline p-1.5 text-xs bg-surface"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                data-testid={`schema-prop-${i}-desc`}
                value={row.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                placeholder="Description (optional)"
                className="flex-1 min-w-0 rounded border border-outline p-1.5 text-xs bg-surface"
              />
              <label className="flex items-center gap-1 text-[10px] text-on-surface-variant shrink-0 cursor-pointer">
                <input
                  data-testid={`schema-prop-${i}-required`}
                  type="checkbox"
                  checked={row.required}
                  onChange={(e) => updateRow(i, { required: e.target.checked })}
                  className="w-3 h-3 accent-primary"
                />
                Required
              </label>
              <button
                type="button"
                data-testid={`schema-prop-${i}-remove`}
                onClick={() => removeRow(i)}
                className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container rounded shrink-0"
                aria-label="Remove field"
              >
                <Icon name="close" className="text-sm" />
              </button>
            </div>
          ))}
          <div className="px-2 py-1.5 bg-surface-container/50">
            <button
              type="button"
              data-testid="json-schema-add-prop"
              onClick={addRow}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Icon name="add" className="text-sm" /> Add property
            </button>
          </div>
        </div>
      )}

      {helpText && <p className="text-[10px] text-on-surface-variant">{helpText}</p>}
    </div>
  );
}
