import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import '@/styles/globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AssistantProvider } from '@/components/assistant/AssistantContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { AssistantButton } from '@/components/assistant/AssistantButton';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { Icon } from '@/components/ui/Icon';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AssistantProvider>
          <TooltipProvider>
            <Component {...pageProps} />
            <AssistantGate />
            <ThemeToggleFloating />
          </TooltipProvider>
        </AssistantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AssistantGate() {
  const { user, loading } = useAuth();
  const { pathname } = useRouter();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isApprovalsPage = pathname?.startsWith('/approvals');
  if (loading || !user) return null;
  if (!can('flow:create') && !(isApprovalsPage && can('execution:approve'))) return null;
  return <><AssistantPanel /><AssistantButton /></>;
}

function ThemeToggleFloating() {
  const { theme, toggle } = useTheme();
  // Only show on pages that don't have the editor's bottom bar
  const { pathname } = useRouter();
  if (pathname?.includes('/flows/') && pathname?.endsWith('/edit')) return null;
  return (
    <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
      <button
        onClick={toggle}
        className="fixed bottom-6 left-6 z-50 w-10 h-10 rounded-full bg-surface shadow-m3-2 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {theme === 'light' ? <Icon name="dark_mode" className="text-lg" /> : <Icon name="light_mode" className="text-lg" />}
      </button>
    </Tooltip>
  );
}
