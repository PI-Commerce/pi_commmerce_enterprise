import { BaseEdge, getBezierPath, type EdgeProps } from "reactflow";

/**
 * Smooth bezier edge between the real source/target handles.
 *
 * We let ELK ("layered") own *node placement* (which keeps branches on their
 * own side and removes crossings) and draw the connections as gentle bezier
 * curves between handles — matching the ReactFlow elkjs example. This reads far
 * cleaner than the previous orthogonal polyline, which produced rigid, fixed
 * right-angle corners. Honors `style.stroke/strokeWidth` (analytics colors edges).
 */
export function RoutedEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style, markerEnd,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

export const edgeTypes = { routed: RoutedEdge };
