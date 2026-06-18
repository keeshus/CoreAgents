import { AlertTriangle } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
      )}
    </div>
  );
}
