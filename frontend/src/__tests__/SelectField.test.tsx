import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectField } from '@/components/ui/SelectField';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

function openSelect() {
  const trigger = screen.getByRole('combobox');
  fireEvent.click(trigger);
}

describe('SelectField', () => {
  it('renders with label', () => {
    render(<SelectField label="Choose" value="" onChange={() => {}} options={options} />);
    expect(screen.getByText('Choose')).toBeInTheDocument();
  });

  it('renders options in portal when opened', () => {
    render(<SelectField label="Choose" value="" onChange={() => {}} options={options} />);
    openSelect();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('shows selected value label', () => {
    render(<SelectField label="Choose" value="a" onChange={() => {}} options={options} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn();
    render(<SelectField label="Choose" value="" onChange={onChange} options={options} />);
    openSelect();
    const itemB = screen.getByText('Option B');
    fireEvent.click(itemB);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows error message', () => {
    render(<SelectField label="Choose" value="" onChange={() => {}} options={options} error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('shows help text when no error', () => {
    render(<SelectField label="Choose" value="" onChange={() => {}} options={options} helpText="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('shows "No options" when options are empty and select is opened', () => {
    render(<SelectField label="Choose" value="" onChange={() => {}} options={[]} />);
    openSelect();
    expect(screen.getByText('No options')).toBeInTheDocument();
  });
});