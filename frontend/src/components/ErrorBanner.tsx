import { Icon } from '@/components/ui/Icon';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4 flex items-center gap-2">
      <Icon name="warning" className="text-base shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="flex items-center gap-1 text-red-500 hover:text-red-700"><Icon name="close" className="text-sm font-bold" /> Dismiss</button>
      )}
    </div>
  );
}
