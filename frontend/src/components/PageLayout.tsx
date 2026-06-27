import { ReactNode } from 'react';

interface PageLayoutProps {
  children: ReactNode;
  maxWidth?: '2xl' | '3xl' | '4xl';
}

const widths = { '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl' };

export function PageLayout({ children, maxWidth = '4xl' }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-surface-container">
      <div className={`${widths[maxWidth]} mx-auto p-6`}>
        {children}
      </div>
    </div>
  );
}
