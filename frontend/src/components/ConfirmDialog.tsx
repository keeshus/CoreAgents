import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@/components/ui/Icon';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-m3-4 max-w-sm w-full mx-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-on-surface m-0">{title}</Dialog.Title>
            <Dialog.Close className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface-variant"><Icon name="close" className="text-base" /> Close</Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-on-surface-variant mb-6">{message}</Dialog.Description>
          <div className="flex items-center justify-end gap-3">
            <Dialog.Close className="px-3 py-1.5 text-sm text-on-surface-variant hover:text-on-surface">{cancelLabel}</Dialog.Close>
            <button onClick={onConfirm} className={`m3-button text-sm ${variant === 'danger' ? 'bg-error' : 'bg-primary'}`}>{confirmLabel}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
