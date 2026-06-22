import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, useReactFlow } from '@xyflow/react';

export function DeletableEdge(props: EdgeProps) {
  const { id, selected, style, markerEnd } = props;
  const { deleteElements } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath(props);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {selected && (
          <button
            onClick={() => deleteElements({ edges: [{ id }] })}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: '#dc2626',
              color: 'white',
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
            title="Delete edge"
          >
            ✕
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
