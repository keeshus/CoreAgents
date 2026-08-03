import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextField } from '@/components/ui/TextField';

describe('TextField', () => {
  it('renders with label', () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<TextField value="" onChange={() => {}} placeholder="Enter name" />);
    const input = screen.getByPlaceholderText('Enter name');
    expect(input).toBeInTheDocument();
  });

  it('renders with value', () => {
    render(<TextField value="hello" onChange={() => {}} />);
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeInTheDocument();
  });

  it('calls onChange when value changes', () => {
    const onChange = vi.fn();
    render(<TextField value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new' } });
    expect(onChange).toHaveBeenCalledWith('new');
  });

  it('shows error state', () => {
    render(<TextField label="Email" value="" onChange={() => {}} error="Invalid email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
  });

  it('handles disabled state', () => {
    render(<TextField label="Name" value="test" onChange={() => {}} disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('renders textarea when multiline is true', () => {
    render(<TextField value="" onChange={() => {}} multiline />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('shows help text when no error', () => {
    render(<TextField label="Name" value="" onChange={() => {}} helpText="Enter your full name" />);
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('hides help text when error is present', () => {
    render(<TextField label="Name" value="" onChange={() => {}} helpText="Enter your full name" error="Required" />);
    expect(screen.queryByText('Enter your full name')).toBeNull();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});