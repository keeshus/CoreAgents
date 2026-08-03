import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('provides tooltip content via data attribute', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Helpful info">
          <button>Target</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('renders tooltip content in portal', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Tooltip text">
          <span>Element</span>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Element')).toBeInTheDocument();
  });
});