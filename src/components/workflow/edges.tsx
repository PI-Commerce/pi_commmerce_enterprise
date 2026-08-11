import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "reactflow";

/**
 * Smooth bezier edge between the real source/target handles.
 *
 * We let ELK ("layered") own node placement (which keeps branches on their own
 * side and removes crossings) and draw the connections as gentle bezier curves
 * between handles, matching the ReactFlow elkjs example. Honors
 * `style.stroke/strokeWidth` (analytics colors edges).
 *
 * When the edge carries a `label`, it is drawn near the path midpoint via
 * `EdgeLabelRenderer` (an HTML overlay ReactFlow ships for this purpose). Used
 * by the freeform-workflow expansion overlay to render per-edge lead counts.
 */
export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label !== undefined && label !== null && label !== "" && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              // The label is HTML, not part of the SVG, so it sits above the
              // edge visually. Pointer events off so it doesn't intercept
              // clicks on nodes underneath.
              pointerEvents: "none",
              padding: labelBgPadding
                ? `${labelBgPadding[1]}px ${labelBgPadding[0]}px`
                : "2px 6px",
              borderRadius: labelBgBorderRadius ?? 4,
              background: (labelBgStyle?.fill as string) ?? "var(--background)",
              opacity:
                labelBgStyle && "fillOpacity" in labelBgStyle
                  ? (labelBgStyle.fillOpacity as number)
                  : 0.95,
              boxShadow: "0 0 0 1px var(--border)",
              ...labelStyle,
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { routed: RoutedEdge };
