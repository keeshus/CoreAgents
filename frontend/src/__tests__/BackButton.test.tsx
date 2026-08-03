import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BackButton } from '@/components/BackButton';

describe('BackButton', () => {
  it('renders Back text', () => {
    render(<BackButton href="/flows" />);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders arrow_back icon', () => {
    render(<BackButton href="/flows" />);
    expect(screen.getByText('arrow_back')).toBeInTheDocument();
  });

  it('uses correct href', () => {
    render(<BackButton href="/flows" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/flows');
  });

  it('uses different href', () => {
    render(<BackButton href="/settings" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/settings');
  });
});