import { useState, useRef, useEffect, useCallback } from 'react';
import { getUpstreamNodeIds, getNodeFields } from './InputPreview';
import { useStore } from '@xyflow/react';

interface TemplateAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Node ID of the current config modal (to compute upstream fields) */
  nodeId?: string;
  /** Pre-computed field suggestions. Falls back to computing from nodeId. */
  suggestions?: string[];
  /** All nodes from the flow (required if nodeId is provided) */
  nodes?: any[];
  /** All edges from the flow (required if nodeId is provided) */
  edges?: any[];
}

interface Suggestion {
  path: string;
  label: string;
}

export function TemplateAutocomplete({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  nodeId,
  suggestions,
  nodes = [],
  edges = [],
}: TemplateAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);

  // Build suggestion list from upstream nodes
  useEffect(() => {
    if (suggestions) {
      setAllSuggestions(suggestions.map(s => ({ path: s, label: s })));
      return;
    }
    if (!nodeId || nodes.length === 0) return;
    const upstreamIds = getUpstreamNodeIds(nodeId, edges);
    const result: Suggestion[] = [];
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n: any) => n.id === upId);
      if (!upNode) continue;
      const label = upNode.data?.label || upNode.data?.type || upId;
      const fields = getNodeFields(upNode);
      result.push({ path: `input.${label}`, label: `${label} (all)` });
      for (const f of fields) {
        result.push({ path: `input.${label}.${f.name}`, label: `${label}.${f.name} : ${f.type}` });
      }
    }
    setAllSuggestions(result);
  }, [nodeId, nodes, edges, suggestions]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    // Check if we're inside {{ }}
    const pos = e.target.selectionStart || 0;
    const before = val.slice(0, pos);
    const lastOpen = before.lastIndexOf('{{');
    const lastClose = before.lastIndexOf('}}');

    if (lastOpen > lastClose) {
      // Inside {{ ... }}
      const partial = before.slice(lastOpen + 2).toLowerCase();
      setFilter(partial);
      setShowDropdown(true);

      // Position dropdown near cursor
      const textarea = e.target;
      const lineHeight = 20;
      const lines = before.split('\n');
      const lineNum = lines.length;
      const colNum = lines[lines.length - 1].length;
      const rect = textarea.getBoundingClientRect();
      const scrollTop = textarea.scrollTop;
      setCursorPos({
        top: (lineNum * lineHeight) - scrollTop + 24,
        left: Math.min(colNum * 8, rect.width - 200),
      });
    } else {
      setShowDropdown(false);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'Escape') {
      setShowDropdown(false);
      e.preventDefault();
    }
  }, [showDropdown]);

  const insertSuggestion = useCallback((path: string) => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const lastOpen = before.lastIndexOf('{{');
    // Replace from {{ to cursor with the full {{input...}}
    const newValue = before.slice(0, lastOpen) + `{{${path}}}` + after;
    onChange(newValue);
    setShowDropdown(false);
    // Focus and place cursor after the inserted text
    setTimeout(() => {
      if (textareaRef.current) {
        const insertPos = lastOpen + path.length + 4; // {{...}}
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(insertPos, insertPos);
      }
    }, 0);
  }, [value, onChange]);

  const filtered = filter
    ? allSuggestions.filter(s => s.label.toLowerCase().includes(filter))
    : allSuggestions;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y font-mono ${className}`}
      />
      {showDropdown && filtered.length > 0 && (
        <div
          className="absolute z-50 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto"
          style={{ top: cursorPos.top, left: cursorPos.left, minWidth: 220 }}
        >
          {filtered.map((s) => (
            <button
              key={s.path}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 border-b border-gray-50 last:border-b-0"
              onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s.path); }}
            >
              <code className="font-mono text-blue-600">{s.path}</code>
              <span className="text-gray-400 ml-2">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
