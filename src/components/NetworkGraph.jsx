import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GraphCanvas, darkTheme, Sphere, Badge, getCurve, calculateEdgeCurveOffset } from 'reagraph';
import { BoxGeometry, Vector3 } from 'three';

/**
 * Reagraph-based renderer. Replaces the hand-rolled canvas/D3 draw loop.
 *
 * It is deliberately "dumb": it takes whatever nodes/edges/positions the
 * topology transform produced and renders them. Both the global hierarchy
 * and a single building view go through this same component.
 */

const sharedBoxGeometry = new BoxGeometry(1, 1, 1);

// Links are drawn only a pixel or two wide when zoomed out, so Reagraph's own
// mesh hit-testing almost never registers them. We pick links ourselves in
// screen space: anything within this many pixels of the cursor counts.
const EDGE_PICK_RADIUS_PX = 10;
const EDGE_SAMPLES = 24;
const projected = new Vector3();

function distToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

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
    linkWidth = 1,
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
  const isGlobalView = viewKey.startsWith('global');
  const isMouseDownRef = useRef(false);
  const containerRef = useRef(null);
  const nodeHoveredRef = useRef(false);
  const [dragTick, setDragTick] = useState(0);

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

  // Link thickness is a display setting: scale here so changing it never
  // triggers a full topology rebuild.
  const displayEdges = useMemo(
    () => (linkWidth === 1 ? edges : edges.map((e) => ({ ...e, size: (e.size ?? 1) * linkWidth }))),
    [edges, linkWidth]
  );

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
      setDragTick((t) => t + 1);
    }
  }, []);

  // World-space sample points along every link, using Reagraph's own curve
  // maths so the pick area follows exactly what is drawn.
  const edgeSamples = useMemo(() => {
    const samples = [];
    for (const edge of edges) {
      if (edge.source === edge.target) continue;
      const a = getNodePosition(edge.source);
      const b = getNodePosition(edge.target);
      const { curved, curveOffset } = calculateEdgeCurveOffset({ edge, edges, curved: true });
      const curve = getCurve(new Vector3(a.x, a.y, a.z || 0), 0, new Vector3(b.x, b.y, b.z || 0), 0, curved, curveOffset);
      samples.push({ edge, points: curve.getPoints(EDGE_SAMPLES) });
    }
    return samples;
    // positions/viewKey/dragTick change what getNodePosition returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, positions, viewKey, dragTick, getNodePosition]);

  // Nearest link to a screen point, or null if none is within the pick radius.
  const pickEdgeAt = useCallback(
    (clientX, clientY) => {
      const canvas = containerRef.current?.querySelector('canvas');
      const camera = graphRef.current?.getControls?.()?.camera;
      if (!canvas || !camera) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;

      let best = null;
      let bestSq = EDGE_PICK_RADIUS_PX * EDGE_PICK_RADIUS_PX;
      for (const { edge, points } of edgeSamples) {
        let prevX = 0;
        let prevY = 0;
        for (let i = 0; i < points.length; i++) {
          projected.copy(points[i]).project(camera);
          const sx = ((projected.x + 1) / 2) * rect.width;
          const sy = ((1 - projected.y) / 2) * rect.height;
          if (i > 0) {
            const d = distToSegmentSq(px, py, prevX, prevY, sx, sy);
            if (d < bestSq) {
              bestSq = d;
              best = edge;
            }
          }
          prevX = sx;
          prevY = sy;
        }
      }
      return best;
    },
    [edgeSamples]
  );

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

  const edgeIdSet = useMemo(() => new Set(edges.map((e) => e.id)), [edges]);
  const clearEdgeHover = useCallback(() => {
    if (hoveredIdRef.current && edgeIdSet.has(hoveredIdRef.current)) {
      hoveredIdRef.current = null;
      setHoveredId(null);
      onHover?.(null);
    }
    if (containerRef.current) containerRef.current.style.cursor = '';
  }, [edgeIdSet, onHover]);

  // Pointer tracking for link hover, throttled to one pick per frame.
  const moveFrameRef = useRef(0);
  // Set when Reagraph's own node/link click fires, so the container's click
  // handler (which runs right after, as the event bubbles) doesn't override it.
  const meshClickRef = useRef(false);
  const pointerDownAtRef = useRef(null);

  const handleContainerClick = useCallback(
    (event) => {
      const handled = meshClickRef.current;
      meshClickRef.current = false;
      if (handled || event.button !== 0) return;
      // Ignore the click that ends a pan or a node drag.
      const down = pointerDownAtRef.current;
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const edge = pickEdgeAt(event.clientX, event.clientY);
      if (edge) onSelect?.(edge);
    },
    [pickEdgeAt, onSelect]
  );
  const handleContainerPointerMove = useCallback(
    (event) => {
      const { clientX, clientY } = event;
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = requestAnimationFrame(() => {
        // Nodes win over links, and nothing changes mid-drag or mid-pan.
        if (isMouseDownRef.current || nodeHoveredRef.current) return;
        const edge = pickEdgeAt(clientX, clientY);
        if (!edge) {
          clearEdgeHover();
          return;
        }
        if (containerRef.current) containerRef.current.style.cursor = 'pointer';
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        if (hoveredIdRef.current === edge.id) return;
        hoveredIdRef.current = edge.id;
        setHoveredId(edge.id);
        onHover?.(edge);
      });
    },
    [pickEdgeAt, clearEdgeHover, onHover]
  );

  useEffect(() => () => cancelAnimationFrame(moveFrameRef.current), []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMove={handleContainerPointerMove}
      onPointerDown={(event) => {
        pointerDownAtRef.current = { x: event.clientX, y: event.clientY };
        meshClickRef.current = false;
      }}
      onClick={handleContainerClick}
      onPointerLeave={() => {
        cancelAnimationFrame(moveFrameRef.current);
        clearEdgeHover();
      }}
    >
    <GraphCanvas
      ref={graphRef}
      theme={theme}
      nodes={nodes}
      edges={displayEdges}
      layoutType="custom"
      layoutOverrides={layoutOverrides}
      draggable={true}
      onNodeDragged={handleNodeDragged}
      cameraMode="pan"
      animated={false}
      // "nodes" keeps labels camera-independent so all core, distribution,
      // and building nodes display their label and subLabel clearly.
      labelType="nodes"
      // Reagraph rescales node.size into [minNodeSize, maxNodeSize], so the
      // smallest tier (distribution routers, buildings) always lands on the
      // minimum. Raise it so those nodes stay visible under dense links.
      // The global view has room for much larger nodes than a building's
      // tightly packed switch grid.
      minNodeSize={isGlobalView ? 26 : 14}
      maxNodeSize={isGlobalView ? 34 : 20}
      edgeArrowPosition="end"
      edgeInterpolation="curved"
      minDistance={200}
      maxDistance={45000}
      selections={validSelections}
      actives={actives}
      onNodeClick={(node) => {
        meshClickRef.current = true;
        onSelect?.(node);
      }}
      onNodeDoubleClick={(node) => onActivate?.(node)}
      onNodePointerOver={(node) => {
        nodeHoveredRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = '';
        handlePointerOver(node);
      }}
      onNodePointerOut={(node) => {
        nodeHoveredRef.current = false;
        handlePointerOut(node);
      }}
      onNodeContextMenu={(node) => onContextMenu?.(node)}
      onEdgeClick={(edge) => {
        meshClickRef.current = true;
        onSelect?.(edge);
      }}
      // A click that misses every mesh may still be close to a thin link.
      onCanvasClick={(event) => {
        onSelect?.(event ? pickEdgeAt(event.clientX, event.clientY) : null);
      }}
      contextMenu={
        renderContextMenu ? ({ data, onClose }) => renderContextMenu(data, onClose) : undefined
      }
      renderNode={({ node, ...rest }) => {
        const hasAlarm = node.data?.stats?.activeAlarmCount > 0;
        const alarmCount = node.data?.stats?.activeAlarmCount || 0;
        const isRouter = node.data?.deviceType === 'router';
        const boxScale = rest.size * 1.75;
        
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
    </div>
  );
});

export default NetworkGraph;
