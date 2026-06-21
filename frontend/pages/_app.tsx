import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import '@/styles/globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AssistantProvider } from '@/components/assistant/AssistantContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { AssistantButton } from '@/components/assistant/AssistantButton';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <AssistantProvider>
        <Component {...pageProps} />
        <AssistantGate />
      </AssistantProvider>
    </AuthProvider>
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
