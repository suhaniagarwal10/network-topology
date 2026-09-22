import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTopologyData } from './hooks/useTopologyData';
import { useBuildingMapping } from './hooks/useBuildingMapping';
import { buildBuildingGraph, buildGlobalGraph, computeBuildingStats } from './utils/topologyTransform';
import NetworkGraph from './components/NetworkGraph';
import BuildingView from './components/BuildingView';
import DetailsPanel from './components/DetailsPanel';
import SearchBar from './components/SearchBar';
import Breadcrumbs from './components/Breadcrumbs';
import Legend from './components/Legend';
import { ZoomControls, Header, ContextMenu, Toast } from './components/Chrome';
import './index.css';

// Fixed reference time for "3h ago"-style alarm ages in the generated sample
// dataset (see meta.generatedAt). Once alarms come from a live feed, replace
// this with `new Date()`.
const DATASET_NOW = new Date('2026-09-15T09:00:00');

export default function App() {
  const { loading, error, data } = useTopologyData();
  const mappingIndex = useBuildingMapping(data);

  // 'global'  -> core routers / distribution routers / buildings
  // 'building'-> the individual switches inside one building
  const [view, setView] = useState('global');
  const [mode, setMode] = useState('graph'); // global view only: graph | cards
  const [activeBuildingId, setActiveBuildingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [highlightIds, setHighlightIds] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tick, setTick] = useState(0);

  const graphRef = useRef(null);

  const simulateAlarm = useCallback(() => {
    if (!data) return;
    const switches = data.nodes.filter(n => n.type === 'switch');
    if (switches.length === 0) return;
    const target = switches[Math.floor(Math.random() * switches.length)];
    
    if (!data.alarmsByNode.has(target.id)) {
      data.alarmsByNode.set(target.id, []);
    }
    
    data.alarmsByNode.get(target.id).push({
      alarmId: `A-${Date.now()}`,
      nodeId: target.id,
      status: 'active',
      severity: 'critical',
      description: 'Simulated interactive alarm spike!',
      raisedAt: new Date().toISOString()
    });
    
    // Force a re-render and re-computation of graphs by updating tick
    setTick(t => t + 1);
    
    // Auto-navigate and highlight the building/node so user sees the cool UI updates
    const building = mappingIndex?.buildingBySwitchId.get(target.id);
    if (building) {
      if (view === 'global') {
        setSelectedId(building.id);
        setHighlightIds([building.id]);
        setFocusRequest({ ids: [building.id], mode: 'fitThenCenter', key: `sim-${building.id}-${Date.now()}` });
      }
      showToast(`⚠️ Simulated Alarm triggered in ${building.name} on ${target.name}!`);
    } else {
      showToast(`⚠️ Simulated Alarm triggered on ${target.name}!`);
    }
  }, [data, mappingIndex, view]);

  /* ---------------- derived graphs ---------------- */

  const globalGraph = useMemo(
    () => (data && mappingIndex ? buildGlobalGraph(data, mappingIndex) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, mappingIndex, tick]
  );

  const activeBuilding = activeBuildingId ? mappingIndex?.buildingsById.get(activeBuildingId) : null;

  const buildingGraph = useMemo(
    () => (data && mappingIndex && activeBuilding ? buildBuildingGraph(activeBuilding, data, mappingIndex) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, mappingIndex, activeBuilding, tick]
  );

  const graph = view === 'building' ? buildingGraph : globalGraph;

  /* ---------------- selection ---------------- */

  const selectedBuilding =
    selectedId && mappingIndex?.buildingsById.has(selectedId)
      ? mappingIndex.buildingsById.get(selectedId)
      : null;
  const selectedNode = selectedId && !selectedBuilding ? data?.nodesById.get(selectedId) || null : null;

  const selectedBuildingStats = useMemo(
    () => (selectedBuilding && data ? computeBuildingStats(selectedBuilding, data) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedBuilding, data, tick]
  );

  const detailAlarms = useMemo(() => {
    if (!data) return [];
    if (selectedNode) return data.alarmsByNode.get(selectedNode.id) || [];
    if (selectedBuilding) {
      return selectedBuilding.switchIds.flatMap((id) => data.alarmsByNode.get(id) || []);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedNode, selectedBuilding, tick]);

  /* ---------------- header stats ---------------- */

  const stats = useMemo(() => {
    if (!data || !mappingIndex) {
      return {
        deviceCount: 0,
        routerCount: 0,
        switchCount: 0,
        buildingCount: 0,
        linkCount: 0,
        downCount: 0,
        activeAlarmCount: 0,
      };
    }
    const v = data.validation;
    return {
      deviceCount: v.actualDevices,
      routerCount: v.routerCount,
      switchCount: v.switchCount,
      buildingCount: mappingIndex.buildings.length,
      linkCount: data.resolvedLinks.length,
      downCount: data.nodes.filter((n) => n.status === 'down').length,
      activeAlarmCount: [...data.alarmsByNode.values()].flat().filter((a) => a.status === 'active').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mappingIndex, tick]);

  /* ---------------- navigation ---------------- */

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const goGlobal = useCallback(() => {
    setView('global');
    setActiveBuildingId(null);
    setSelectedId(null);
    setHighlightIds(null);
    setFocusRequest({ ids: null, mode: 'fit', key: `global-${Date.now()}` });
  }, []);

  const openBuilding = useCallback(
    (buildingId, focusNodeId = null) => {
      if (!mappingIndex?.buildingsById.has(buildingId)) return;
      setView('building');
      setMode('graph');
      setActiveBuildingId(buildingId);
      setSelectedId(focusNodeId);
      setHighlightIds(null);
      setFocusRequest({
        ids: focusNodeId ? [focusNodeId] : null,
        mode: focusNodeId ? 'fitThenCenter' : 'fit',
        key: `${buildingId}-${focusNodeId}-${Date.now()}`,
      });
    },
    [mappingIndex]
  );

  // Focus is deferred a tick so Reagraph has laid the new graph out before we
  // ask the camera to frame something in it.
  //
  // 'fitThenCenter' matters for single targets: fitting the camera to one node
  // fills the screen with that node and loses all context, so we frame the
  // whole graph first and then pan to the target, which stays highlighted.
  useEffect(() => {
    if (!focusRequest) return;
    const timers = [];
    timers.push(
      setTimeout(() => {
        const { ids, mode } = focusRequest;
        if (mode === 'fitThenCenter') {
          graphRef.current?.fit();
          timers.push(setTimeout(() => graphRef.current?.center(ids), 420));
        } else {
          graphRef.current?.fit(ids || undefined);
        }
      }, 260)
    );
    return () => timers.forEach(clearTimeout);
  }, [focusRequest, graph]);

  /* ---------------- search ---------------- */

  const handleSearchPick = useCallback(
    (entry) => {
      if (entry.kind === 'building') {
        setView('global');
        setMode('graph');
        setActiveBuildingId(null);
        setSelectedId(entry.buildingId);
        setHighlightIds([entry.buildingId]);
        setFocusRequest({ ids: [entry.buildingId], mode: 'fitThenCenter', key: `find-${entry.buildingId}-${Date.now()}` });
        return;
      }

      if (entry.kind === 'switch' && entry.buildingId) {
        // Navigate into the switch's building, then highlight the switch
        // itself — never a duplicate node, always the real one.
        openBuilding(entry.buildingId, entry.nodeId);
        setHighlightIds([entry.nodeId]);
        showToast(`${entry.title} — ${mappingIndex.buildingsById.get(entry.buildingId)?.name}`);
        return;
      }

      // Routers live in the global hierarchy.
      setView('global');
      setMode('graph');
      setActiveBuildingId(null);
      setSelectedId(entry.nodeId);
      setHighlightIds([entry.nodeId]);
      setFocusRequest({ ids: [entry.nodeId], mode: 'fitThenCenter', key: `find-${entry.nodeId}-${Date.now()}` });
    },
    [openBuilding, showToast, mappingIndex]
  );

  /* ---------------- node interactions ---------------- */

  const handleSelect = useCallback((node) => {
    setHighlightIds(null);
    setSelectedId(node ? node.id : null);
  }, []);

  const handleActivate = useCallback(
    (node) => {
      if (node?.data?.kind === 'building') openBuilding(node.data.buildingId);
    },
    [openBuilding]
  );

  const monitorNode = useCallback(
    (node) => {
      showToast(`Monitoring started for ${node.name || node.label} (stub — wire to your monitoring API)`);
    },
    [showToast]
  );

  const highlightNeighbors = useCallback(
    (node) => {
      const id = node.id;
      setSelectedId(id);
      const neighbours = new Set([id]);
      for (const e of graph?.edges || []) {
        if (e.source === id) neighbours.add(e.target);
        if (e.target === id) neighbours.add(e.source);
      }
      setHighlightIds([...neighbours]);
      setFocusRequest({ ids: [...neighbours], mode: 'fit', key: `nb-${id}-${Date.now()}` });
    },
    [graph]
  );

  const contextItems = useCallback((graphNode) => {
    const isBuilding = graphNode?.data?.kind === 'building';
    return [
      { key: 'details', label: isBuilding ? 'View building details' : 'View node details' },
      ...(isBuilding ? [{ key: 'open', label: 'Open building →' }] : []),
      { key: 'neighbors', label: 'Highlight neighbors' },
      ...(isBuilding ? [] : [{ key: 'monitor', label: 'Monitor node' }]),
      { key: 'sep', label: null },
      ...(isBuilding ? [] : [{ key: 'copyip', label: 'Copy IP address' }]),
    ];
  }, []);

  const handleContextAction = useCallback(
    (key, graphNode) => {
      const isBuilding = graphNode?.data?.kind === 'building';
      if (key === 'details') setSelectedId(graphNode.id);
      if (key === 'open' && isBuilding) openBuilding(graphNode.data.buildingId);
      if (key === 'neighbors') highlightNeighbors(graphNode);
      if (key === 'monitor') monitorNode(data?.nodesById.get(graphNode.id) || graphNode);
      if (key === 'copyip') {
        const ip = data?.nodesById.get(graphNode.id)?.ipAddress;
        if (ip) {
          navigator.clipboard?.writeText(ip).catch(() => {});
          showToast(`Copied ${ip}`);
        }
      }
    },
    [data, openBuilding, highlightNeighbors, monitorNode, showToast]
  );

  /* ---------------- render ---------------- */

  if (error) {
    return <div className="load-error">Couldn&apos;t load the topology dataset: {error}</div>;
  }

  const ready = !loading && data && mappingIndex && graph;
  const validation = data?.validation;

  return (
    <div id="app">
      <Header stats={stats} view={view} mode={mode} onModeChange={setMode} onSimulateAlarm={simulateAlarm}>
        <SearchBar data={data} mappingIndex={mappingIndex} onPick={handleSearchPick} />
      </Header>

      {validation && !validation.ok && (
        <div className="validation-banner">
          Device count mismatch — expected {validation.expectedDevices}, found {validation.actualDevices}.
        </div>
      )}

      <Breadcrumbs
        building={activeBuilding}
        node={view === 'building' ? selectedNode : null}
        onGoGlobal={goGlobal}
        onGoBuilding={(id) => openBuilding(id)}
      />

      <main>
        <div className="canvas-area">
          {!ready ? (
            <div className="load-hint">Loading topology&hellip;</div>
          ) : view === 'global' && mode === 'cards' ? (
            <BuildingView
              buildings={mappingIndex.buildings}
              statsById={globalGraph.buildingStats}
              selectedId={selectedId}
              onSelect={(b) => setSelectedId(b.id)}
              onOpen={(b) => openBuilding(b.id)}
            />
          ) : (
            <>
              <NetworkGraph
                ref={graphRef}
                nodes={graph.nodes}
                edges={graph.edges}
                positions={graph.positions}
                selectedId={selectedId}
                highlightIds={highlightIds}
                onSelect={handleSelect}
                onActivate={handleActivate}
                onHover={setHovered}
                renderContextMenu={(graphNode, onClose) => (
                  <ContextMenu
                    node={graphNode}
                    items={contextItems(graphNode)}
                    onAction={handleContextAction}
                    onClose={onClose}
                  />
                )}
              />
              {hovered && (
                <div className="hoverchip">
                  <b>{hovered.data?.name || hovered.label || hovered.id}</b>
                  {hovered.data?.kind === 'building' ? (
                    <span>
                      {hovered.data.stats.total} switches · {hovered.data.stats.connected} connected ·{' '}
                      {hovered.data.stats.activeAlarmCount} active alarms
                    </span>
                  ) : (
                    <span>
                      {data?.nodesById.get(hovered.id)?.ipAddress} ·{' '}
                      {data?.nodesById.get(hovered.id)?.status} ·{' '}
                      {data?.nodesById.get(hovered.id)?.location}
                    </span>
                  )}
                </div>
              )}
              <ZoomControls
                onZoomIn={() => graphRef.current?.zoomIn()}
                onZoomOut={() => graphRef.current?.zoomOut()}
                onFit={() => graphRef.current?.fit()}
              />
              <Legend view={view} />
              {view === 'building' && buildingGraph && (
                <div className="viewbadge">
                  {activeBuilding.name} · {activeBuilding.switchIds.length} switches ·{' '}
                  {buildingGraph.uplinkRouterIds.length} uplink routers
                </div>
              )}
            </>
          )}
          <Toast message={toast} />
        </div>

        <DetailsPanel
          node={selectedNode}
          building={selectedBuilding}
          buildingStats={selectedBuildingStats}
          alarms={detailAlarms}
          linkCount={selectedNode ? (data.linksByNode.get(selectedNode.id) || []).length : 0}
          interfaceCount={selectedNode ? (data.interfacesByNode.get(selectedNode.id) || []).length : 0}
          owningBuilding={selectedNode ? mappingIndex?.buildingBySwitchId.get(selectedNode.id) : null}
          floor={selectedNode ? mappingIndex?.floorBySwitchId.get(selectedNode.id) : null}
          onMonitor={monitorNode}
          onHighlightNeighbors={highlightNeighbors}
          onOpenBuilding={(id) => openBuilding(id)}
          now={DATASET_NOW}
        />
      </main>
    </div>
  );
}
