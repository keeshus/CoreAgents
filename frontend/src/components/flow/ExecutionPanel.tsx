import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface ExecutionPanelProps {
  isRunning: boolean;
  onRun: (input: string) => void;
  onStop?: () => void;
  events: Array<{ type: string; data: Record<string, any>; timestamp: string }>;
  output: any;
  error: string | null;
}

export function ExecutionPanel({ isRunning, onRun, onStop, events, output, error }: ExecutionPanelProps) {
  const [input, setInput] = useState('');
  return (
    <div className="w-72 border-l bg-surface flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold mb-2">Execution</h3>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"message": "Hello!"}'
          rows={2}
          className="w-full text-xs border rounded p-1.5 mb-2 resize-none font-mono"
          disabled={isRunning}
        />
        <div className="flex items-center gap-1.5">
          {isRunning && onStop && (
            <button
              onClick={onStop}
              className="m3-button text-xs bg-error"
            >
              <Icon name="stop" className="text-xs" /> Stop
            </button>
          )}
          <button
            onClick={() => onRun(input || '{"message":"Hello!"}')}
            disabled={isRunning}
            className="m3-button text-xs disabled:opacity-50"
          >
            {isRunning ? <Icon name="sync" className="text-xs animate-spin" /> : <Icon name="send" className="text-xs" />}
            {isRunning ? 'Running' : 'Run'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 && !isRunning && (
          <p className="text-xs text-on-surface-variant text-center mt-4">Click Run to execute the flow</p>
        )}
        {events.map((evt, i) => (
          <div key={i} className={`p-2 rounded text-xs ${
            evt.type.includes('failed') ? 'bg-error-container border border-error' :
            evt.type.includes('completed') ? 'bg-success-container border border-success' :
            'bg-primary-container border border-primary'
          }`}>
            <p className="font-medium">{evt.type}</p>
            <pre className="mt-1 text-[10px] overflow-auto max-h-20">{JSON.stringify(evt.data, null, 2)}</pre>
          </div>
        ))}
        {output && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-on-surface-variant">Output</h4>
            <pre className="text-[10px] bg-surface-container p-2 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(output, null, 2)}</pre>
          </div>
        )}
        {error && (
          <div className="p-2 bg-error-container border border-error rounded text-xs text-error">{error}</div>
        )}
      </div>
    </div>
  );
}
