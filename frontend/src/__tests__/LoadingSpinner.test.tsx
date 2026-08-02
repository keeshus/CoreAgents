import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders sync icon', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('sync')).toBeInTheDocument();
  });

  it('has animate-spin class on icon', () => {
    render(<LoadingSpinner />);
    const icon = screen.getByText('sync');
    expect(icon.className).toContain('animate-spin');
  });

  it('applies className to container', () => {
    render(<LoadingSpinner className="extra-class" />);
    const container = screen.getByText('sync').parentElement;
    expect(container?.className).toContain('extra-class');
  });

  it('uses default className when not provided', () => {
    render(<LoadingSpinner />);
    const container = screen.getByText('sync').parentElement;
    expect(container?.className).toContain('flex');
    expect(container?.className).toContain('items-center');
    expect(container?.className).toContain('justify-center');
    expect(container?.className).toContain('py-16');
  });
});