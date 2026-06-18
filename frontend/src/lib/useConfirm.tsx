import { useState, useCallback } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
}

export function useConfirm(defaults: ConfirmOptions = {}) {
  const [state, setState] = useState<{ open: boolean; resolve: (value: boolean) => void } & ConfirmOptions>({ open: false, resolve: () => {} });

  const confirm = useCallback((opts: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ open: true, resolve, ...defaults, ...opts });
    });
  }, [defaults]);

  const handleConfirm = useCallback(() => {
    state.resolve(true);
    setState(s => ({ ...s, open: false }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolve(false);
    setState(s => ({ ...s, open: false }));
  }, [state]);

  return {
    confirm,
    dialog: (
      <ConfirmDialog
        open={state.open}
        title={state.title || 'Confirm'}
        message={state.message || 'Are you sure?'}
        confirmLabel={state.confirmLabel}
        variant={state.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
  };
}
