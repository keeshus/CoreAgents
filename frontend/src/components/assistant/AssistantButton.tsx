import { useAssistant } from './AssistantContext';
import { MessageCircle, X } from 'lucide-react';

export function AssistantButton() {
  const { open, toggle } = useAssistant();
  return (
    <button
      onClick={toggle}
      className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-m3-3 flex items-center justify-center transition-colors bg-primary text-white hover:bg-primary"
      title={open ? 'Close assistant' : 'Open assistant'}
    >
      {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
    </button>
  );
}
