import { Icon } from '@/components/ui/Icon';

interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Icon name="sync" className="text-2xl text-gray-400 animate-spin" />
    </div>
  );
}
