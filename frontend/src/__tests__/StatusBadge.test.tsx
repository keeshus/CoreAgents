import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders completed status with success color', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    const badge = screen.getByText('Completed').closest('span');
    expect(badge?.className).toContain('text-success');
    expect(badge?.className).toContain('bg-success-container');
  });

  it('renders failed status with error color', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    const badge = screen.getByText('Failed').closest('span');
    expect(badge?.className).toContain('text-error');
    expect(badge?.className).toContain('bg-error-container');
  });

  it('renders running status with primary color and spin animation', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    const icon = screen.getByText('sync');
    expect(icon.className).toContain('animate-spin');
  });

  it('renders pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders cancelled status', () => {
    render(<StatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders awaiting_approval status', () => {
    render(<StatusBadge status="awaiting_approval" />);
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
  });

  it('falls back to pending for unknown status', () => {
    render(<StatusBadge status="unknown_status" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders icon when iconOnly is true', () => {
    render(<StatusBadge status="completed" iconOnly />);
    expect(screen.getByText('check_circle')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).toBeNull();
  });
});