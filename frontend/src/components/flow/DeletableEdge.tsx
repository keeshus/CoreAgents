import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps, useReactFlow } from '@xyflow/react';
import { Tooltip } from '@/components/ui/Tooltip';

export function DeletableEdge(props: EdgeProps) {
  const { id, selected, style, markerEnd, type } = props;
  const { deleteElements } = useReactFlow();
  const pathFn = type === 'smoothstep' ? getSmoothStepPath : getBezierPath;
  const [edgePath, labelX, labelY] = pathFn(props);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {selected && (
          <Tooltip content="Delete edge">
            <button
              onClick={() => deleteElements({ edges: [{ id }] })}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'all',
                background: 'var(--md-error)',
                color: 'var(--md-on-error)',
                border: 'none',
                borderRadius: '50%',
                width: 22,
                height: 22,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                zIndex: 10,
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </Tooltip>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
