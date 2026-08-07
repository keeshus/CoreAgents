import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';

interface Item {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Item[];
  includeAll?: boolean;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({ label, value, onChange, items, includeAll = true, allLabel = 'All items', placeholder = 'Search...', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find(i => i.value === value);
  const displayValue = selected?.label || (includeAll ? allLabel : '');
  const float = open || displayValue.length > 0;

  const filtered = items.filter(i =>
    i.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={displayValue ? `${label}: ${displayValue}` : label}
        onClick={() => setOpen(!open)}
        className={`w-full rounded-t bg-surface-container-high border-b-2 transition-colors flex items-center justify-between text-left cursor-pointer min-h-[48px] group ${
          open ? 'border-primary' : 'border-outline-variant hover:border-outline'
        }`}
      >
        <span className="text-on-surface outline-none px-4 pt-5 pb-2 text-sm truncate leading-[1.5]">
          {displayValue}
        </span>
        <Icon name="arrow_drop_down" className={`text-lg text-on-surface-variant pr-3 shrink-0 transition-transform group-data-[state=open]:rotate-180 ${open ? 'rotate-180' : ''}`} />
      </button>

      <label className={`absolute left-4 transition-all pointer-events-none ${
        float
          ? 'text-[10px] top-1.5 text-on-surface-variant'
          : 'text-sm top-2 text-outline'
      } ${open ? '!text-primary' : ''}`}>
        {label}
      </label>

      {open && (
        <div className="absolute z-50 w-full bg-surface-container-high border border-outline-variant rounded-b shadow-m3-2 max-h-60 overflow-hidden">
          <div className="p-2 border-b border-outline-variant">
            <input
              autoFocus
              placeholder={placeholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm bg-surface rounded px-2 py-1.5 outline-none border border-outline focus:border-primary"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {includeAll && !search && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-surface-container-highest ${!value ? 'bg-primary-container text-primary' : 'text-on-surface'}`}
              >{allLabel}</button>
            )}
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-on-surface-variant">No results match</p>
            ) : (
              filtered.map(i => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => { onChange(i.value); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-surface-container-highest ${value === i.value ? 'bg-primary-container text-primary' : 'text-on-surface'}`}
                >{i.label}</button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
