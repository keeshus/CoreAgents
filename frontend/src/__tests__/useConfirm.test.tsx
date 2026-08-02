import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useConfirm } from '@/lib/useConfirm';

function TestComponent({ onResult }: { onResult?: (result: boolean) => void }) {
  const { confirm, dialog } = useConfirm({ title: 'Test Confirm', message: 'Are you sure?' });
  return (
    <div>
      <button onClick={async () => { const r = await confirm({ title: 'Custom Title', message: 'Custom message?' }); onResult?.(r); }}>
        Show Confirm
      </button>
      {dialog}
    </div>
  );
}

describe('useConfirm', () => {
  it('shows dialog when confirm is called', () => {
    render(<TestComponent />);
    fireEvent.click(screen.getByText('Show Confirm'));
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom message?')).toBeInTheDocument();
  });

  it('resolves promise as true when confirmed', async () => {
    const onResult = vi.fn();
    render(<TestComponent onResult={onResult} />);
    fireEvent.click(screen.getByText('Show Confirm'));
    fireEvent.click(screen.getByText('Delete'));
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(true);
    });
  });

  it('resolves promise as false when cancelled', async () => {
    const onResult = vi.fn();
    render(<TestComponent onResult={onResult} />);
    fireEvent.click(screen.getByText('Show Confirm'));
    fireEvent.click(screen.getByText('Cancel'));
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(false);
    });
  });

  it('uses default options when no custom options provided', () => {
    function DefaultTest() {
      const { confirm, dialog } = useConfirm();
      return (
        <div>
          <button onClick={() => confirm()}>Default</button>
          {dialog}
        </div>
      );
    }
    render(<DefaultTest />);
    fireEvent.click(screen.getByText('Default'));
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});