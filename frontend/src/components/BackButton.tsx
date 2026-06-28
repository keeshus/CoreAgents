import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface BackButtonProps {
  href: string;
}

export function BackButton({ href }: BackButtonProps) {
  return (
    <Link href={href} className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded px-1 py-0.5 transition-colors">
      <Icon name="arrow_back" className="text-base" /> <span>Back</span>
    </Link>
  );
}
