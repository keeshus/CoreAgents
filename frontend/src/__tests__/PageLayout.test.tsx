import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageLayout } from '@/components/PageLayout';

describe('PageLayout', () => {
  it('renders children', () => {
    render(
      <PageLayout>
        <h1>Dashboard</h1>
      </PageLayout>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <PageLayout>
        <h1>Title</h1>
        <p>Content</p>
      </PageLayout>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with custom maxWidth', () => {
    const { container } = render(
      <PageLayout maxWidth="2xl">
        <span>Narrow</span>
      </PageLayout>,
    );
    const inner = container.querySelector('.max-w-2xl');
    expect(inner).toBeInTheDocument();
  });

  it('uses default maxWidth of 4xl', () => {
    const { container } = render(
      <PageLayout>
        <span>Default</span>
      </PageLayout>,
    );
    const inner = container.querySelector('.max-w-4xl');
    expect(inner).toBeInTheDocument();
  });

  it('has surface container background', () => {
    const { container } = render(
      <PageLayout>
        <span>Content</span>
      </PageLayout>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('bg-surface-container');
  });
});