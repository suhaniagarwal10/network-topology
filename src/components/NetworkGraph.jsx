import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GraphCanvas, darkTheme, Sphere, Badge } from 'reagraph';

/**
 * Reagraph-based renderer. Replaces the hand-rolled canvas/D3 draw loop.
 *
 * It is deliberately "dumb": it takes whatever nodes/edges/positions the
 * topology transform produced and renders them. Both the global hierarchy
 * and a single building view go through this same component.
 */

const theme = {
  ...darkTheme,
  // Fog is disabled on purpose: this layout is wide, so the camera sits
  // far back when fitting the whole estate and three's fog would grey it out.
  canvas: { background: '#0b0f16', fog: null },
  node: {
    ...darkTheme.node,
    activeFill: '#60a5fa',
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.25,
    label: {
      ...darkTheme.node.label,
      color: '#cbd5e1',
      activeColor: '#ffffff',
      stroke: '#0b0f16',
    },
    subLabel: {
      ...(darkTheme.node.subLabel || {}),
      color: '#7c8797',
      activeColor: '#cbd5e1',
      stroke: '#0b0f16',
    },
  },
  ring: { fill: '#1f2937', activeFill: '#60a5fa' },
  edge: {
    ...darkTheme.edge,
    fill: '#334155',
    activeFill: '#93c5fd',
    opacity: 0.4,
    selectedOpacity: 1,
    inactiveOpacity: 0.05,
    label: { ...darkTheme.edge.label, color: '#94a3b8', activeColor: '#e2e8f0' },
  },
  arrow: { fill: '#3f4a5c', activeFill: '#93c5fd' },
};

const NetworkGraph = forwardRef(function NetworkGraph(
  {
    nodes,
    edges,
    positions,
    selectedId,
    highlightIds,
    onSelect,
    onActivate,
    onContextMenu,
    renderContextMenu,
    onHover,
  },
  ref
) {
  const graphRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);

  // Nodes adjacent to whatever is selected/hovered — Reagraph dims everything
  // that isn't in `actives`, which gives us neighbour highlighting for free.
  const adjacency = useMemo(() => {
    const map = new Map();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source).add(e.target);
      map.get(e.target).add(e.source);
    }
    return map;
  }, [edges]);

  const actives = useMemo(() => {
    if (highlightIds && highlightIds.length > 0) return highlightIds;
    const focus = hoveredId || selectedId;
    if (!focus) return [];
    const neighbours = adjacency.get(focus);
    const ids = [focus, ...(neighbours ? [...neighbours] : [])];
    // Include the edges between the focus node and its neighbours so the
    // connecting lines stay lit rather than dimmed.
    for (const e of edges) {
      if (e.source === focus || e.target === focus) ids.push(e.id);
    }
    return ids;
  }, [hoveredId, selectedId, highlightIds, adjacency, edges]);

  const getNodePosition = useCallback(
    (id) => positions.get(id) || { x: 0, y: 0, z: 0 },
    [positions]
  );

  useImperativeHandle(
    ref,
    () => ({
      fit: (ids) => graphRef.current?.fitNodesInView(ids && ids.length ? ids : undefined),
      center: (ids) => graphRef.current?.centerGraph(ids && ids.length ? ids : undefined),
      zoomIn: () => graphRef.current?.zoomIn(),
      zoomOut: () => graphRef.current?.zoomOut(),
    }),
    []
  );

  const handlePointerOver = useCallback(
    (node) => {
      setHoveredId(node.id);
      onHover?.(node);
    },
    [onHover]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    onHover?.(null);
  }, [onHover]);

  return (
    <GraphCanvas
      ref={graphRef}
      theme={theme}
      nodes={nodes}
      edges={edges}
      layoutType="custom"
      layoutOverrides={{ getNodePosition }}
      cameraMode="pan"
      animated={false}
      // "nodes" keeps labels camera-independent. Density is controlled by
      // simply not giving the 140 distribution routers a label — see
      // buildGlobalGraph — rather than by hoping the camera is close enough.
      labelType="nodes"
      edgeArrowPosition="none"
      edgeInterpolation="linear"
      minDistance={200}
      maxDistance={45000}
      selections={selectedId ? [selectedId] : []}
      actives={actives}
      onNodeClick={(node) => onSelect?.(node)}
      onNodeDoubleClick={(node) => onActivate?.(node)}
      onNodePointerOver={handlePointerOver}
      onNodePointerOut={handlePointerOut}
      onNodeContextMenu={(node) => onContextMenu?.(node)}
      onCanvasClick={() => onSelect?.(null)}
      contextMenu={
        renderContextMenu ? ({ data, onClose }) => renderContextMenu(data, onClose) : undefined
      }
      renderNode={({ node, ...rest }) => {
        const hasAlarm = node.data?.stats?.activeAlarmCount > 0;
        const alarmCount = node.data?.stats?.activeAlarmCount || 0;
        
        return (
          <group>
            <Sphere node={node} {...rest} />
            {hasAlarm && (
              <Badge
                node={node}
                {...rest}
                label={alarmCount > 99 ? '99+' : alarmCount.toString()}
                backgroundColor="#ef4444"
                textColor="#ffffff"
                position="top-right"
              />
            )}
          </group>
        );
      }}
    />
  );
});

export default NetworkGraph;
