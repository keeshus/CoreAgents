import * as Select from '@radix-ui/react-select';
import { Icon } from '@/components/ui/Icon';

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  helpText?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectField({ label, value, onChange, options, error, helpText, disabled, className = '' }: SelectFieldProps) {
  const selectedLabel = options.find(o => o.value === value)?.label || '';

  return (
    <div className={`relative ${className}`}>
      <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
         <Select.Trigger
          className={`w-full rounded-t bg-surface-container-high border-b-2 transition-colors flex items-center justify-between text-left cursor-pointer min-h-[48px] group ${
            error ? 'border-error' : 'border-outline-variant data-[state=open]:border-primary focus:border-primary'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <Select.Value asChild>
            <span className="text-on-surface outline-none px-4 pt-5 pb-2 text-sm truncate leading-[1.5]">
              {selectedLabel || ''}
            </span>
          </Select.Value>
          <Select.Icon className="pr-3 shrink-0">
            <Icon name="arrow_drop_down" className="text-lg text-on-surface-variant transition-transform group-data-[state=open]:rotate-180" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={0}
            className="z-50 bg-surface-container-high border border-outline-variant rounded-b shadow-m3-2 max-h-48 overflow-y-auto"
            style={{ width: 'var(--radix-select-trigger-width)' }}
          >
            <Select.Viewport>
              {options.length === 0 && (
                <p className="px-4 py-3 text-sm text-on-surface-variant">No options</p>
              )}
              {options.map(o => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="w-full text-left px-4 py-2 text-sm cursor-pointer transition-colors data-[highlighted]:bg-surface-container-highest data-[state=checked]:bg-primary-container data-[state=checked]:text-primary text-on-surface outline-none"
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <label className={`absolute left-4 transition-all pointer-events-none ${
        value.length > 0
          ? 'text-[10px] top-1.5 text-on-surface-variant'
          : 'text-sm top-2 text-outline'
      } ${error ? '!text-error' : ''}`}>
        {label}
      </label>

      {error && (
        <div className="flex items-center gap-1 mt-1">
          <Icon name="error" className="text-xs text-error" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}
      {helpText && !error && (
        <p className="text-xs text-on-surface-variant mt-1">{helpText}</p>
      )}
    </div>
  );
}
