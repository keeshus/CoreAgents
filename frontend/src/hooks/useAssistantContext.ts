import { useEffect } from 'react';
import { useAssistant } from '../components/assistant/AssistantContext';

interface AssistantContextProps {
  pageKey: string;
  description: string;
  data?: Record<string, unknown>;
}

export function useAssistantContext({ pageKey, description, data }: AssistantContextProps) {
  const { setPageContext, setActiveTools, activeTools, getToolsForPage } = useAssistant();

  useEffect(() => {
    setPageContext({ pageKey, description, data });

    // Load tools for this page
    const nodeType = data?.nodeType as string | undefined;
    const tools = getToolsForPage(pageKey, nodeType);
    setActiveTools(tools);

    return () => {
      // Page unmount — conversation saved by AssistantProvider
    };
  }, [pageKey, description]);
}
