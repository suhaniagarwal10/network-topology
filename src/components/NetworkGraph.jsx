import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GraphCanvas, darkTheme, Sphere, Badge } from 'reagraph';
import { BoxGeometry } from 'three';

/**
 * Reagraph-based renderer. Replaces the hand-rolled canvas/D3 draw loop.
 *
 * It is deliberately "dumb": it takes whatever nodes/edges/positions the
 * topology transform produced and renders them. Both the global hierarchy
 * and a single building view go through this same component.
 */

const sharedBoxGeometry = new BoxGeometry(1, 1, 1);

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
    inactiveOpacity: 1,
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
    fill: '#64748b',
    activeFill: '#93c5fd',
    opacity: 0.85,
    selectedOpacity: 1,
    inactiveOpacity: 0.75,
    label: { ...darkTheme.edge.label, color: '#94a3b8', activeColor: '#e2e8f0' },
  },
  arrow: { fill: '#64748b', activeFill: '#93c5fd' },
};

const DRAG_STORAGE_KEY = 'network_topology_dragged_positions';

function loadSavedDraggedPositions() {
  try {
    const raw = localStorage.getItem(DRAG_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

const NetworkGraph = forwardRef(function NetworkGraph(
  {
    nodes,
    edges,
    positions,
    viewKey = 'global',
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
  const hoveredIdRef = useRef(null);
  const draggedPositionsRef = useRef(loadSavedDraggedPositions());
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  const isMouseDownRef = useRef(false);

  // Track global pointer down / up to completely suppress hover events during node dragging
  // or canvas panning. This avoids 60 FPS re-render storms and hoverchip churn.
  useEffect(() => {
    const handleDown = (e) => {
      if (e.button === 0) isMouseDownRef.current = true;
    };
    const handleUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener('pointerdown', handleDown);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  const validIdSet = useMemo(() => {
    const set = new Set();
    for (const n of nodes) set.add(n.id);
    for (const e of edges) set.add(e.id);
    return set;
  }, [nodes, edges]);

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

  const validSelections = useMemo(() => {
    if (selectedId && validIdSet.has(selectedId)) return [selectedId];
    return [];
  }, [selectedId, validIdSet]);

  const actives = useMemo(() => {
    if (highlightIds && highlightIds.length > 0) {
      return highlightIds.filter((id) => validIdSet.has(id));
    }
    const focus = (hoveredId && validIdSet.has(hoveredId))
      ? hoveredId
      : (selectedId && validIdSet.has(selectedId) ? selectedId : null);
    if (!focus) return [];

    const focusEdge = edges.find((e) => e.id === focus);
    if (focusEdge) {
      const ids = [focusEdge.id, focusEdge.source, focusEdge.target];
      for (const e of edges) {
        if (
          (e.source === focusEdge.source && e.target === focusEdge.target) ||
          (e.source === focusEdge.target && e.target === focusEdge.source)
        ) {
          ids.push(e.id);
        }
      }
      return ids;
    }

    const neighbours = adjacency.get(focus);
    const ids = [focus, ...(neighbours ? [...neighbours] : [])];
    for (const e of edges) {
      if (e.source === focus || e.target === focus) ids.push(e.id);
    }
    return ids;
  }, [hoveredId, selectedId, highlightIds, adjacency, edges, validIdSet]);

  const getNodePosition = useCallback((id) => {
    const viewDrags = draggedPositionsRef.current[viewKeyRef.current];
    if (viewDrags && viewDrags[id]) {
      return viewDrags[id];
    }
    return positionsRef.current?.get(id) || { x: 0, y: 0, z: 0 };
  }, []);

  const layoutOverrides = useMemo(() => ({ getNodePosition }), [getNodePosition]);

  const handleNodeDragged = useCallback((node) => {
    if (node?.id && node?.position) {
      const vk = viewKeyRef.current;
      if (!draggedPositionsRef.current[vk]) {
        draggedPositionsRef.current[vk] = {};
      }
      draggedPositionsRef.current[vk][node.id] = {
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
      };
      try {
        localStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(draggedPositionsRef.current));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fit: (ids) => graphRef.current?.fitNodesInView(ids && ids.length ? ids : undefined),
      center: (ids) => graphRef.current?.centerGraph(ids && ids.length ? ids : undefined),
      zoomIn: () => graphRef.current?.zoomIn(),
      zoomOut: () => graphRef.current?.zoomOut(),
      clearDraggedPositions: () => {
        draggedPositionsRef.current = {};
        localStorage.removeItem(DRAG_STORAGE_KEY);
      },
    }),
    []
  );

  const hoverTimeoutRef = useRef(null);

  const handlePointerOver = useCallback(
    (node) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (isMouseDownRef.current || !node?.id) return;
      if (hoveredIdRef.current === node.id) return;
      hoveredIdRef.current = node.id;
      setHoveredId(node.id);
      onHover?.(node);
    },
    [onHover]
  );

  const handlePointerOut = useCallback(() => {
    if (isMouseDownRef.current) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      hoveredIdRef.current = null;
      setHoveredId(null);
      onHover?.(null);
    }, 150);
  }, [onHover]);

  return (
    <GraphCanvas
      ref={graphRef}
      theme={theme}
      nodes={nodes}
      edges={edges}
      layoutType="custom"
      layoutOverrides={layoutOverrides}
      draggable={true}
      onNodeDragged={handleNodeDragged}
      cameraMode="pan"
      animated={false}
      // "nodes" keeps labels camera-independent so all core, distribution,
      // and building nodes display their label and subLabel clearly.
      labelType="nodes"
      edgeArrowPosition="end"
      edgeInterpolation="curved"
      minDistance={200}
      maxDistance={45000}
      selections={validSelections}
      actives={actives}
      onNodeClick={(node) => onSelect?.(node)}
      onNodeDoubleClick={(node) => onActivate?.(node)}
      onNodePointerOver={handlePointerOver}
      onNodePointerOut={handlePointerOut}
      onNodeContextMenu={(node) => onContextMenu?.(node)}
      onEdgePointerOver={(edge) => {
        if (isMouseDownRef.current) return;
        document.body.style.cursor = 'pointer';
        handlePointerOver(edge);
      }}
      onEdgePointerOut={() => {
        if (isMouseDownRef.current) return;
        document.body.style.cursor = 'default';
        handlePointerOut();
      }}
      onEdgeClick={(edge) => {
        onSelect?.(edge);
      }}
      onCanvasClick={() => {
        onSelect?.(null);
      }}
      contextMenu={
        renderContextMenu ? ({ data, onClose }) => renderContextMenu(data, onClose) : undefined
      }
      renderNode={({ node, ...rest }) => {
        const hasAlarm = node.data?.stats?.activeAlarmCount > 0;
        const alarmCount = node.data?.stats?.activeAlarmCount || 0;
        const isRouter = node.data?.deviceType === 'router';
        const isDistRouter = isRouter && node.data?.tier === 'distribution';
        const boxScale = isDistRouter ? rest.size * 1.1 : rest.size * 1.75;
        
        return (
          <group>
            {isRouter ? (
              <mesh
                geometry={sharedBoxGeometry}
                scale={[boxScale, boxScale, boxScale]}
              >
                <meshBasicMaterial color={rest.color} transparent={true} opacity={rest.opacity ?? 1} />
              </mesh>
            ) : (
              <Sphere node={node} {...rest} />
            )}
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
