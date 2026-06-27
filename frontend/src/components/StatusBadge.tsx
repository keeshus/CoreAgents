import { Icon } from '@/components/ui/Icon';

const statusConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  completed: { icon: 'check_circle', color: 'text-success', bg: 'bg-success-container', label: 'Completed' },
  failed: { icon: 'cancel', color: 'text-error', bg: 'bg-error-container', label: 'Failed' },
  running: { icon: 'sync', color: 'text-primary', bg: 'bg-primary-container', label: 'Running' },
  pending: { icon: 'schedule', color: 'text-on-secondary-container', bg: 'bg-secondary-container', label: 'Pending' },
  cancelled: { icon: 'cancel', color: 'text-on-surface-variant', bg: 'bg-surface-container-high', label: 'Cancelled' },
  awaiting_approval: { icon: 'schedule', color: 'text-on-secondary-container', bg: 'bg-secondary-container', label: 'Awaiting Approval' },
};

interface StatusBadgeProps {
  status: string;
  iconOnly?: boolean;
}

export function StatusBadge({ status, iconOnly }: StatusBadgeProps) {
  const cfg = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon name={cfg.icon} className={`text-xs ${status === 'running' ? 'animate-spin' : ''}`} />
      {!iconOnly && cfg.label}
    </span>
  );
}
