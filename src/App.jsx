import { useMemo, useRef, useState } from 'react';
import { useTopologyData } from './hooks/useTopologyData';
import TopologyCanvas from './components/TopologyCanvas';
import DetailsPanel from './components/DetailsPanel';
import { Legend, ZoomControls, Header, ContextMenu, Toast } from './components/Chrome';
import './index.css';

// Fixed reference time for "3h ago"-style alarm ages in the generated sample
// dataset (see meta.generatedAt). Once alarms come from a live feed, replace
// this with `new Date()` inside DetailsPanel/timeAgo.
const DATASET_NOW = new Date('2026-09-15T09:00:00');

export default function App() {
  const { loading, error, data } = useTopologyData();
  const [selectedId, setSelectedId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { node, x, y }
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);

  const selectedNode = data && selectedId ? data.nodesById.get(selectedId) : null;

  const stats = useMemo(() => {
    if (!data) return { nodeCount: 0, linkCount: 0, downCount: 0, activeAlarmCount: 0 };
    return {
      nodeCount: data.nodes.length,
      linkCount: data.resolvedLinks.length,
      downCount: data.nodes.filter((n) => n.status === 'down').length,
      activeAlarmCount: [...data.alarmsByNode.values()].flat().filter((a) => a.status === 'active').length,
    };
  }, [data]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  function monitorNode(node) {
    showToast(`Monitoring started for ${node.name} (stub — wire to your monitoring API)`);
  }

  function highlightNeighbors(node) {
    setSelectedId(node.id);
    canvasRef.current?.focusOnNode(node);
  }

  function handlePickNode(node) {
    setSelectedId(node.id);
    canvasRef.current?.focusOnNode(node);
  }

  function handleContextAction(key, node) {
    if (key === 'details') setSelectedId(node.id);
    if (key === 'monitor') monitorNode(node);
    if (key === 'neighbors') highlightNeighbors(node);
    if (key === 'copyip') {
      navigator.clipboard?.writeText(node.ipAddress).catch(() => {});
      showToast(`Copied ${node.ipAddress}`);
    }
  }

  if (error) {
    return <div className="load-error">Couldn't load the topology dataset: {error}</div>;
  }

  return (
    <div id="app">
      <Header stats={stats} nodes={data?.nodes || []} onPickNode={handlePickNode} />
      <main>
        <div className="canvas-area" onClick={() => setCtxMenu(null)}>
          {loading || !data ? (
            <div className="load-hint">Loading topology&hellip;</div>
          ) : (
            <TopologyCanvas
              ref={canvasRef}
              data={data}
              selectedId={selectedId}
              onSelect={(node) => setSelectedId(node ? node.id : null)}
              onContextMenu={(node, x, y) => setCtxMenu({ node, x, y })}
            />
          )}
          <ZoomControls
            onZoomIn={() => canvasRef.current?.zoomBy(1.3)}
            onZoomOut={() => canvasRef.current?.zoomBy(1 / 1.3)}
            onFit={() => canvasRef.current?.fit()}
          />
          <Legend />
          {ctxMenu && (
            <ContextMenu
              node={ctxMenu.node}
              x={ctxMenu.x}
              y={ctxMenu.y}
              onClose={() => setCtxMenu(null)}
              onAction={handleContextAction}
            />
          )}
          <Toast message={toast} />
        </div>
        <DetailsPanel
          node={selectedNode}
          alarms={selectedNode ? data.alarmsByNode.get(selectedNode.id) || [] : []}
          linkCount={selectedNode ? (data.linksByNode.get(selectedNode.id) || []).length : 0}
          onMonitor={monitorNode}
          onHighlightNeighbors={highlightNeighbors}
          now={DATASET_NOW}
        />
      </main>
    </div>
  );
}
