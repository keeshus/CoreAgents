import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BrandLogo({ size = 'md', className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-xl bg-primary text-primary-container shadow-m3-1 shrink-0',
        size === 'sm' && 'w-8 h-8',
        size === 'md' && 'w-10 h-10',
        size === 'lg' && 'w-14 h-14',
        className,
      )}
    >
      <Icon name="hub" className={size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-2xl' : 'text-lg'} />
    </span>
  );
}
