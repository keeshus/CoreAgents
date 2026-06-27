import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface BackButtonProps {
  href: string;
}

export function BackButton({ href }: BackButtonProps) {
  return (
    <Link href={href} className="text-gray-400 hover:text-gray-600">
      <Icon name="arrow_back" className="text-base" />
    </Link>
  );
}
