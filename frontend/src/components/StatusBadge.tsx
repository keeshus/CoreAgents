import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Failed' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Running' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Pending' },
  cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', label: 'Cancelled' },
  awaiting_approval: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Awaiting Approval' },
};

interface StatusBadgeProps {
  status: string;
  iconOnly?: boolean;
}

export function StatusBadge({ status, iconOnly }: StatusBadgeProps) {
  const cfg = statusConfig[status] || statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {!iconOnly && cfg.label}
    </span>
  );
}
