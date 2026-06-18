import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href: string;
}

export function BackButton({ href }: BackButtonProps) {
  return (
    <Link href={href} className="text-gray-400 hover:text-gray-600">
      <ArrowLeft className="w-4 h-4" />
    </Link>
  );
}
