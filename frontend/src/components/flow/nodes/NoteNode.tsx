import { type NodeProps } from '@xyflow/react';
import { Icon } from '@/components/ui/Icon';

export function NoteNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const content = config?.content || '';
  const color = config?.color || 'var(--md-secondary-container)';
  const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-3 min-w-[160px] max-w-[260px] transition-shadow ${
        props.selected ? 'ring-2 ring-primary shadow-m3-2' : 'shadow-m3-1'
      }`}
      style={{ backgroundColor: color, borderColor: 'var(--md-outline-variant)' }}
    >
      <div className="flex items-start gap-2">
        <Icon name="sticky_note_2" className="text-sm text-on-surface-variant mt-0.5 shrink-0" />
        <div>
          <span className="text-xs font-medium text-on-surface-variant block">
            {(props.data?.label as string) || 'Note'}
          </span>
          {preview ? (
            <p className="text-[10px] text-on-surface-variant mt-1 whitespace-pre-wrap">{preview}</p>
          ) : (
            <p className="text-[10px] text-outline-variant mt-1 italic">Empty note</p>
          )}
        </div>
      </div>
    </div>
  );
}
