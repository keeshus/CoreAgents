import { X } from 'lucide-react';

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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">{cancelLabel}</button>
          <button onClick={onConfirm} className={`px-3 py-1.5 text-sm text-white rounded font-medium ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
