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
import NodeModal from './components/NodeModal';
import FilterPanel from './components/FilterPanel';
import AlarmPanel from './components/AlarmPanel';
import LinkModal from './components/LinkModal';
import MonitorModal from './components/MonitorModal';
import InterfaceModal from './components/InterfaceModal';
import LinkEditModal from './components/LinkEditModal';
import './index.css';

// Fixed reference time for "3h ago"-style alarm ages in the generated sample
// dataset (see meta.generatedAt). Once alarms come from a live feed, replace
// this with `new Date()`.
const DATASET_NOW = new Date('2026-09-15T09:00:00');

export default function App() {
  const { loading, error, data, loadFromRaw, loadDemo, updateTopology, resetDemo } = useTopologyData();
  const mappingIndex = useBuildingMapping(data);

  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [isAlarmPanelOpen, setIsAlarmPanelOpen] = useState(false);
  
  const [viewingLinksNode, setViewingLinksNode] = useState(null);
  const [viewingInterfacesNode, setViewingInterfacesNode] = useState(null);
  const [monitoringNode, setMonitoringNode] = useState(null);
  const [editingLinkNode, setEditingLinkNode] = useState(null);
  const [editingLinkBundle, setEditingLinkBundle] = useState(null);

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

  const [globalGraph, setGlobalGraph] = useState(null);
  const [buildingGraph, setBuildingGraph] = useState(null);

  const activeBuilding = activeBuildingId ? mappingIndex?.buildingsById.get(activeBuildingId) : null;

  // Full rebuilds on structural changes only (initial load, add/delete nodes, simulate alarm)
  useEffect(() => {
    if (data && mappingIndex) {
      setGlobalGraph(buildGlobalGraph(data, mappingIndex));
    }
  }, [data?.nodes, data?.links, mappingIndex, tick]);

  useEffect(() => {
    if (data && mappingIndex && activeBuilding) {
      setBuildingGraph(buildBuildingGraph(activeBuilding, data, mappingIndex));
    } else {
      setBuildingGraph(null);
    }
  }, [data?.nodes, data?.links, mappingIndex, activeBuildingId, tick]);

  const graph = view === 'building' ? buildingGraph : globalGraph;

  /* ---------------- filters ---------------- */

  const [filters, setFilters] = useState({
    router: true,
    switch: true,
    up: true,
    down: true,
    warningStatus: true,
    critical: true,
    major: true,
    minor: true,
    warning: true,
    normal: true,
  });

  const filteredGraph = useMemo(() => {
    if (!graph) return null;
    const { nodes, edges, positions, ...rest } = graph;

    const filteredNodes = nodes.filter(n => {
      let isRouter = false;
      let isSwitch = false;
      let status = 'up';
      let severity = 'normal';

      if (n.data.kind === 'building') {
        isSwitch = true;
        status = n.data.status; // 'up' or 'down' derived in buildingStats
        severity = n.data.healthLevel || n.data.stats?.worstSeverity || 'normal';
      } else {
        const rawNode = data.nodesById.get(n.id);
        if (rawNode) {
          isRouter = rawNode.type === 'router';
          isSwitch = rawNode.type === 'switch';
          status = rawNode.status;
          severity = rawNode.severity;
        }
      }

      // Type
      if (isRouter && !filters.router) return false;
      if (isSwitch && !filters.switch) return false;

      // Status
      const st = status?.toLowerCase();
      if ((st === 'up' || st === 'connected') && !filters.up) return false;
      if (st === 'down' && !filters.down) return false;
      if ((st === 'warning' || st === 'connecting') && !filters.warningStatus) return false;

      // Severity
      const sev = severity?.toLowerCase() || 'normal';
      if (filters[sev] === false) return false;

      return true;
    });

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { ...rest, nodes: filteredNodes, edges: filteredEdges, positions };
  }, [graph, filters]);

  /* ---------------- selection ---------------- */

  const selectedBuilding =
    selectedId && mappingIndex?.buildingsById.has(selectedId)
      ? mappingIndex.buildingsById.get(selectedId)
      : null;
  const selectedNode = selectedId && !selectedBuilding && data?.nodesById.has(selectedId) 
    ? data.nodesById.get(selectedId) 
    : null;
  const selectedLink = useMemo(() => {
    if (!selectedId || selectedNode || selectedBuilding || !graph) return null;
    return graph.edges.find(e => e.id === selectedId) || null;
  }, [selectedId, selectedNode, selectedBuilding, graph]);

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

  const allAlarms = useMemo(() => {
    if (!data) return [];
    return Array.from(data.alarmsByNode.values()).flat();
  }, [data, tick]);

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

  const focusNode = useCallback(
    (nodeId) => {
      const node = data?.nodesById.get(nodeId);
      if (!node) return;

      if (node.type === 'switch') {
        const building = mappingIndex.buildingBySwitchId.get(nodeId);
        if (building) {
          openBuilding(building.id, nodeId);
          setHighlightIds([nodeId]);
          showToast(`${node.name || nodeId} — ${building.name}`);
          return;
        }
      }

      setView('global');
      setMode('graph');
      setActiveBuildingId(null);
      setSelectedId(nodeId);
      setHighlightIds([nodeId]);
      setFocusRequest({ ids: [nodeId], mode: 'fitThenCenter', key: `focus-${nodeId}-${Date.now()}` });
    },
    [data, mappingIndex, openBuilding, showToast]
  );

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
      
      focusNode(entry.nodeId);
    },
    [focusNode]
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

  const handleAddNode = useCallback(() => {
    setEditingNode(null);
    setIsNodeModalOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeData) => {
    updateTopology((raw) => {
      const idx = raw.nodes.findIndex(n => n.id === nodeData.id);
      if (idx >= 0) {
        raw.nodes[idx] = { ...raw.nodes[idx], ...nodeData };
        showToast(`Updated node ${nodeData.id}`);
      } else {
        raw.nodes.push({ ...nodeData });
        showToast(`Added node ${nodeData.id}`);
      }
    });
    setIsNodeModalOpen(false);
  }, [updateTopology, showToast]);

  const handleSaveLink = useCallback((linkPayload) => {
    updateTopology((raw) => {
      if (linkPayload.isEdit) {
        let count = 0;
        for (let i = 0; i < raw.links.length; i++) {
          if (linkPayload.linkIds.includes(raw.links[i].link_id)) {
            raw.links[i].bandwidth_mbps = linkPayload.bandwidth_mbps;
            raw.links[i].status = linkPayload.status;
            count++;
          }
        }
        showToast(`Updated ${count} link(s) in bundle`);
      } else {
        const { isEdit, ...newLink } = linkPayload;
        raw.links.push(newLink);
        showToast(`Added link from ${newLink.source} to ${newLink.target}`);
      }
    });
    setEditingLinkNode(null);
    setEditingLinkBundle(null);
  }, [updateTopology, showToast]);

  const handleDeleteNode = useCallback((id) => {
    updateTopology((raw) => {
      // 1. Delete the node
      raw.nodes = raw.nodes.filter(n => n.id !== id);
      
      // 2. Identify all interfaces belonging to this node
      const ifacesToRemove = new Set(
        raw.interfaces.filter(i => i.node_id === id).map(i => i.interface_id)
      );
      
      // 3. Delete any links connected to this node or its interfaces
      raw.links = raw.links.filter(l => {
        const connectedToSource = l.source === id || ifacesToRemove.has(l.source_interface_id);
        const connectedToTarget = l.target === id || ifacesToRemove.has(l.target_interface_id);
        return !connectedToSource && !connectedToTarget;
      });
      
      // 4. Delete the interfaces themselves
      raw.interfaces = raw.interfaces.filter(i => i.node_id !== id);
      
      // 5. Clean up alarms
      if (raw.alarmsByNode) raw.alarmsByNode.delete(id);
      raw.alarms = raw.alarms.filter(a => (a.nodeId || a.entity_id) !== id);
      
      showToast(`Deleted node ${id}`);
    });
    setSelectedId(null);
  }, [updateTopology, showToast]);

  const handleUpdateAlarm = useCallback((alarmId, status) => {
    let affectedNodeId = null;
    let newSeverity = null;
    let newStatus = null;

    updateTopology((raw) => {
      const a = raw.alarms.find(a => (a.alarmId || a.id) === alarmId);
      if (a) {
        a.status = status;
        showToast(`Alarm ${status}`);
        
        affectedNodeId = a.nodeId || a.entity_id;
        const activeAlarms = raw.alarms.filter(al => (al.nodeId || al.entity_id) === affectedNodeId && al.status === 'active');
        const node = raw.nodes.find(n => n.id === affectedNodeId);
        
        if (node) {
          if (activeAlarms.length === 0) {
            node.severity = 'normal';
            node.status = 'connected';
          } else {
            const order = { critical: 4, major: 3, minor: 2, warning: 1 };
            let worst = 'warning';
            for (const al of activeAlarms) {
              const s = al.severity?.toLowerCase() || 'critical';
              if ((order[s] || 0) > (order[worst] || 0)) worst = s;
            }
            node.severity = worst;
          }
          newSeverity = node.severity;
          newStatus = node.status;
        }
      }
    });

    // INCREMENTAL UPDATE OPTIMIZATION: Surgically patch the Reagraph nodes array in memory
    // so we don't have to rebuild the entire 1500-node graph.
    if (affectedNodeId && newSeverity) {
      const patchNodes = (prevGraph) => {
        if (!prevGraph) return prevGraph;
        const newNodes = prevGraph.nodes.map(n => {
          if (n.id === affectedNodeId) {
            return {
              ...n,
              fill: newSeverity === 'normal' ? (n.data.kind === 'router' ? '#22c55e' : '#10b981') : (
                newSeverity === 'critical' ? '#ef4444' :
                newSeverity === 'major' ? '#f97316' :
                newSeverity === 'warning' ? '#eab308' : '#5b6472'
              ),
              data: { ...n.data, severity: newSeverity, status: newStatus }
            };
          }
          return n;
        });
        return { ...prevGraph, nodes: newNodes };
      };
      
      setGlobalGraph(patchNodes);
      setBuildingGraph(patchNodes);
    }
  }, [updateTopology, showToast]);

  const monitorNode = useCallback(
    (node) => {
      setMonitoringNode(node);
    },
    []
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
      ...(isBuilding ? [] : [
        { key: 'monitor', label: 'Monitor node' },
        { key: 'add-link', label: 'Connect Link' },
        { key: 'edit', label: 'Edit Node' },
        { key: 'delete', label: 'Delete Node', style: { color: '#ef4444' } },
        { key: 'sep', label: null },
        { key: 'copyip', label: 'Copy IP address' }
      ])
    ];
  }, []);

  const handleContextAction = useCallback(
    (key, graphNode) => {
      const isBuilding = graphNode?.data?.kind === 'building';
      const node = data?.nodesById.get(graphNode.id) || graphNode;
      if (key === 'details') setSelectedId(graphNode.id);
      if (key === 'open' && isBuilding) openBuilding(graphNode.data.buildingId);
      if (key === 'neighbors') highlightNeighbors(graphNode);
      if (key === 'monitor') monitorNode(node);
      if (key === 'add-link') setEditingLinkNode(node);
      if (key === 'edit') {
        setEditingNode(node);
        setIsNodeModalOpen(true);
      }
      if (key === 'delete') {
        if (window.confirm(`Are you sure you want to delete ${node.name}?`)) {
          handleDeleteNode(node.id);
        }
      }
      if (key === 'copyip') {
        const ip = node.ipAddress;
        if (ip) {
          navigator.clipboard?.writeText(ip).catch(() => {});
          showToast(`Copied ${ip}`);
        }
      }
    },
    [data, openBuilding, highlightNeighbors, monitorNode, showToast, handleDeleteNode]
  );

  /* ---------------- render ---------------- */

  if (error) {
    return <div className="load-error">Couldn&apos;t load the topology dataset: {error}</div>;
  }

  const ready = !loading && data && mappingIndex && graph;
  const validation = data?.validation;

  return (
    <div id="app">
      <Header 
        stats={stats} 
        view={view} 
        mode={mode} 
        onModeChange={setMode} 
        onSimulateAlarm={simulateAlarm} 
        onAddNode={handleAddNode} 
        onToggleAlarms={() => setIsAlarmPanelOpen(o => !o)}
        onReset={resetDemo}
      >
        <SearchBar data={data} mappingIndex={mappingIndex} onPick={handleSearchPick} />
      </Header>

      {validation && !validation.ok && (
        <div className="validation-banner">
          Device count mismatch — expected {validation.expectedDevices}, found {validation.actualDevices}.
        </div>
      )}

      {validation && (validation.missingNodeCount > 0 || validation.unresolvedLinkCount > 0) && (
        <div className="validation-banner" style={{ backgroundColor: '#eab308', color: '#000', marginBottom: 8, padding: '4px 12px', borderRadius: 4, display: 'inline-block', marginLeft: 16 }}>
          <strong>Data Anomalies Safely Handled:</strong> Auto-generated {validation.missingNodeCount} missing nodes referenced by links. Ignored {validation.unresolvedLinkCount} orphan links.
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
                nodes={filteredGraph.nodes}
                edges={filteredGraph.edges}
                positions={filteredGraph.positions}
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
              <FilterPanel filters={filters} onChange={setFilters} />
              {hovered && (
                <div className="hoverchip">
                  <b>{hovered.data?.name || hovered.label || hovered.id}</b>
                  {hovered.data?.kind === 'building' ? (
                    <span>
                      {hovered.data.stats.total} switches · {hovered.data.stats.connected} connected ·{' '}
                      {hovered.data.stats.activeAlarmCount} active alarms
                    </span>
                  ) : hovered.data?.kind === 'link' ? (
                    <span>
                      {hovered.source} ↔ {hovered.target} · {hovered.data.count} bundled links
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
          link={selectedLink}
          buildingStats={selectedBuildingStats}
          alarms={detailAlarms}
          linkCount={selectedNode ? (data.linksByNode.get(selectedNode.id) || []).length : 0}
          interfaceCount={selectedNode ? (data.interfacesByNode.get(selectedNode.id) || []).length : 0}
          owningBuilding={selectedNode ? mappingIndex?.buildingBySwitchId.get(selectedNode.id) : null}
          floor={selectedNode ? mappingIndex?.floorBySwitchId.get(selectedNode.id) : null}
          onMonitor={monitorNode}
          onHighlightNeighbors={highlightNeighbors}
          onOpenBuilding={(id) => openBuilding(id)}
          onViewLinks={(id) => setViewingLinksNode(id)}
          onViewInterfaces={(id) => setViewingInterfacesNode(id)}
          onAddLink={(node) => setEditingLinkNode(node)}
          onEditLinkBundle={(bundle) => setEditingLinkBundle(bundle)}
          onEditNode={(n) => {
            setEditingNode(n);
            setIsNodeModalOpen(true);
          }}
          onDeleteNode={(n) => {
            if (window.confirm(`Are you sure you want to delete ${n.name}?`)) {
              handleDeleteNode(n.id);
            }
          }}
          now={DATASET_NOW}
        />
      </main>
      
      {isNodeModalOpen && (
        <NodeModal
          node={editingNode}
          onSave={handleSaveNode}
          onClose={() => setIsNodeModalOpen(false)}
        />
      )}
      
      {viewingLinksNode && (
        <LinkModal
          nodeName={data?.nodesById.get(viewingLinksNode)?.name || viewingLinksNode}
          links={data?.linksByNode.get(viewingLinksNode) || []}
          onClose={() => setViewingLinksNode(null)}
        />
      )}
      
      {viewingInterfacesNode && (
        <InterfaceModal
          nodeName={data?.nodesById.get(viewingInterfacesNode)?.name || viewingInterfacesNode}
          interfaces={data?.interfacesByNode.get(viewingInterfacesNode) || []}
          nodeSeverity={data?.nodesById.get(viewingInterfacesNode)?.severity}
          nodeStatus={data?.nodesById.get(viewingInterfacesNode)?.status}
          onClose={() => setViewingInterfacesNode(null)}
        />
      )}
      
      {isAlarmPanelOpen && (
        <AlarmPanel
          alarms={allAlarms}
          onClose={() => setIsAlarmPanelOpen(false)}
          onAcknowledge={id => handleUpdateAlarm(id, 'acknowledged')}
          onResolve={id => handleUpdateAlarm(id, 'resolved')}
          onFocusNode={focusNode}
          now={DATASET_NOW}
        />
      )}
      
      {monitoringNode && (
        <MonitorModal
          node={monitoringNode}
          onClose={() => setMonitoringNode(null)}
        />
      )}
      
      {(editingLinkNode || editingLinkBundle) && (
        <LinkEditModal
          sourceNode={editingLinkNode}
          linkBundle={editingLinkBundle}
          onSave={handleSaveLink}
          onClose={() => {
            setEditingLinkNode(null);
            setEditingLinkBundle(null);
          }}
        />
      )}
    </div>
  );
}
