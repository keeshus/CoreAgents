import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders icon when iconName is provided', () => {
    render(<EmptyState iconName="inbox" title="Inbox empty" />);
    expect(screen.getByText('inbox')).toBeInTheDocument();
  });

  it('does not render icon when iconName is not provided', () => {
    render(<EmptyState title="No data" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adding some items" />);
    expect(screen.getByText('Try adding some items')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText('Try adding some items')).toBeNull();
  });
});