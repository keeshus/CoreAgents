import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormField, TextInput, TextAreaInput, SelectInput } from '@/components/FormFields';

const selectOptions = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

function openSelect() {
  const trigger = screen.getByRole('combobox');
  fireEvent.click(trigger);
}

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField label="Name">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders help text', () => {
    render(
      <FormField label="Name" helpText="Enter your name">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
  });

  it('renders error text', () => {
    render(
      <FormField label="Name" error="Required">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});

describe('TextInput', () => {
  it('renders input with label', () => {
    render(<TextInput label="Email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders input element', () => {
    render(<TextInput label="Email" placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('passes value and onChange to input', () => {
    const onChange = vi.fn();
    render(<TextInput label="Name" value="test" onChange={onChange} />);
    const input = screen.getByDisplayValue('test');
    fireEvent.change(input, { target: { value: 'new' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('TextAreaInput', () => {
  it('renders textarea with label', () => {
    render(<TextAreaInput label="Description" />);
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('renders textarea element', () => {
    render(<TextAreaInput label="Description" placeholder="Enter description" />);
    const textarea = screen.getByPlaceholderText('Enter description');
    expect(textarea.tagName).toBe('TEXTAREA');
  });
});

describe('SelectInput', () => {
  it('renders with label and options when opened', () => {
    render(<SelectInput label="Choose" options={selectOptions} />);
    expect(screen.getByText('Choose')).toBeInTheDocument();
    openSelect();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn();
    render(<SelectInput label="Choose" options={selectOptions} onChange={onChange} />);
    openSelect();
    fireEvent.click(screen.getByText('Option B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});