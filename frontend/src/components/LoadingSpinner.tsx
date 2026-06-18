import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
    </div>
  );
}
