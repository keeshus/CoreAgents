import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

const items = [
  { value: '1', label: 'Apple' },
  { value: '2', label: 'Banana' },
  { value: '3', label: 'Cherry' },
];

describe('SearchableSelect', () => {
  it('renders with label', () => {
    render(<SearchableSelect label="Fruit" value="" onChange={() => {}} items={items} />);
    expect(screen.getByText('Fruit')).toBeInTheDocument();
  });

  it('shows all label when no value selected', () => {
    render(<SearchableSelect label="Fruit" value="" onChange={() => {}} items={items} allLabel="All fruits" />);
    expect(screen.getByText('All fruits')).toBeInTheDocument();
  });

  it('shows selected item label', () => {
    render(<SearchableSelect label="Fruit" value="2" onChange={() => {}} items={items} />);
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('opens dropdown on button click', () => {
    render(<SearchableSelect label="Fruit" value="" onChange={() => {}} items={items} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('filters options as user types', () => {
    render(<SearchableSelect label="Fruit" value="" onChange={() => {}} items={items} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'App' } });

    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Banana')).toBeNull();
    expect(screen.queryByText('Cherry')).toBeNull();
  });

  it('shows no results message when filter matches nothing', () => {
    render(<SearchableSelect label="Fruit" value="" onChange={() => {}} items={items} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'xyz' } });

    expect(screen.getByText('No results match')).toBeInTheDocument();
  });

  it('closes dropdown when an option is clicked', () => {
    const onChange = vi.fn();
    render(<SearchableSelect label="Fruit" value="" onChange={onChange} items={items} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    const appleButton = screen.getByText('Apple');
    fireEvent.click(appleButton);

    expect(onChange).toHaveBeenCalledWith('1');
    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
  });
});