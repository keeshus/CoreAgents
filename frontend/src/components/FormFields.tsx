import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { SelectField } from '@/components/ui/SelectField';

interface FieldProps {
  label: string;
  helpText?: string;
  error?: string;
}

export function FormField({ label, helpText, error, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-on-surface-variant mb-1">{label}</label>
      {children}
      {helpText && <p className="mt-1 text-[10px] text-on-surface-variant">{helpText}</p>}
      {error && <p className="mt-1 text-[10px] text-error">{error}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;

export function TextInput({ label, helpText, error, className = '', ...props }: InputProps) {
  return (
    <FormField label={label} helpText={helpText} error={error}>
      <input className={`w-full rounded border border-outline p-2 text-sm bg-surface ${className}`} {...props} />
    </FormField>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;

export function TextAreaInput({ label, helpText, error, className = '', ...props }: TextAreaProps) {
  return (
    <FormField label={label} helpText={helpText} error={error}>
      <textarea className={`w-full rounded border border-outline p-2 text-sm resize-y bg-surface ${className}`} {...props} />
    </FormField>
  );
}

export function SelectInput({ label, helpText, error, options, className = '', value, onChange }: {
  label: string;
  helpText?: string;
  error?: string;
  options: { value: string; label: string }[];
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value ?? ''}
      onChange={onChange ?? (() => {})}
      options={options}
      error={error}
      helpText={helpText}
      className={className}
    />
  );
}
