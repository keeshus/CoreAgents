import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AssistantProvider } from '@/components/assistant/AssistantContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { AssistantButton } from '@/components/assistant/AssistantButton';

function AssistantGate() {
  const { user, loading } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  if (loading || !user || !can('flow:create')) return null;
  return (
    <AssistantProvider>
      <AssistantPanel />
      <AssistantButton />
    </AssistantProvider>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <AssistantGate />
      <Component {...pageProps} />
    </AuthProvider>
  );
}
