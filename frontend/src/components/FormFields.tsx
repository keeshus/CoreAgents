import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  helpText?: string;
  error?: string;
}

export function FormField({ label, helpText, error, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
      {helpText && <p className="mt-1 text-[10px] text-gray-400">{helpText}</p>}
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;

export function TextInput({ label, helpText, error, className = '', ...props }: InputProps) {
  return (
    <FormField label={label} helpText={helpText} error={error}>
      <input className={`w-full rounded border border-gray-300 p-2 text-sm ${className}`} {...props} />
    </FormField>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;

export function TextAreaInput({ label, helpText, error, className = '', ...props }: TextAreaProps) {
  return (
    <FormField label={label} helpText={helpText} error={error}>
      <textarea className={`w-full rounded border border-gray-300 p-2 text-sm resize-y ${className}`} {...props} />
    </FormField>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helpText?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function SelectInput({ label, helpText, error, options, className = '', ...props }: SelectProps) {
  return (
    <FormField label={label} helpText={helpText} error={error}>
      <select className={`w-full rounded border border-gray-300 p-2 text-sm bg-white ${className}`} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FormField>
  );
}
