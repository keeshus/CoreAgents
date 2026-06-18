import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mx-auto mb-3" />}
      <p className="text-gray-500 font-medium">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  );
}
