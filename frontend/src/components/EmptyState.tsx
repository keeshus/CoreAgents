import { Icon } from '@/components/ui/Icon';

interface EmptyStateProps {
  iconName?: string;
  title: string;
  description?: string;
}

export function EmptyState({ iconName, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-16 bg-surface rounded-xl border">
      {iconName && <Icon name={iconName} className="text-5xl text-outline-variant mx-auto mb-3" />}
      <p className="text-on-surface-variant font-medium">{title}</p>
      {description && <p className="text-xs text-on-surface-variant mt-1">{description}</p>}
    </div>
  );
}
