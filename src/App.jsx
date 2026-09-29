import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTopologyData } from './hooks/useTopologyData';
import { useBuildingMapping } from './hooks/useBuildingMapping';
import { buildBuildingGraph, buildGlobalGraph, buildGroupGraph, computeBuildingStats } from './utils/topologyTransform';
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
import TrashModal from './components/TrashModal';
import GroupManagerModal from './components/GroupManagerModal';
import QuickAssignGroupModal from './components/QuickAssignGroupModal';
import HelpModal from './components/HelpModal';
import LoadTopologyModal from './components/LoadTopologyModal';
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
  const [deletedElements, setDeletedElements] = useState(() => {
    const saved = localStorage.getItem('network_topology_trash');
    return saved ? JSON.parse(saved) : [];
  });
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('network_topology_trash', JSON.stringify(deletedElements));
  }, [deletedElements]);

  // 'global'  -> core routers / distribution routers / buildings
  // 'building'-> the individual switches inside one building
  // 'group'   -> only the switches belonging to a selective multi-building group
  const [view, setView] = useState('global');
  const [mode, setMode] = useState('graph'); // global view only: graph | cards
  const [activeBuildingId, setActiveBuildingId] = useState(null);
  const [activeGroupName, setActiveGroupName] = useState(null);
  const [includeUplinksInGroup, setIncludeUplinksInGroup] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [highlightIds, setHighlightIds] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tick, setTick] = useState(0);

  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [editingGroupInitial, setEditingGroupInitial] = useState(null);
  const [quickAssignNode, setQuickAssignNode] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isCustomDataset, setIsCustomDataset] = useState(() => {
    return localStorage.getItem('network-topology-is-custom') === 'true';
  });
  const [activeDatasetName, setActiveDatasetName] = useState(() => {
    return localStorage.getItem('network-topology-dataset-name') || 'Default Topology (1,500 Devices)';
  });

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const handleLoadCustom = useCallback((rawPayload) => {
    const name = rawPayload.meta?.name || 'Custom Dataset';
    localStorage.setItem('network-topology-is-custom', 'true');
    localStorage.setItem('network-topology-dataset-name', name);
    localStorage.setItem('network-topology-data', JSON.stringify(rawPayload));
    setIsCustomDataset(true);
    setActiveDatasetName(name);
    loadFromRaw(rawPayload);
    setView('global');
    setMode('graph');
    setActiveBuildingId(null);
    setActiveGroupName(null);
    setSelectedId(null);
    setHighlightIds(null);
    setTick((t) => t + 1);
    showToast(`Generated topology from ${rawPayload.nodes.length} nodes & ${rawPayload.links?.length || 0} links`);
  }, [loadFromRaw, showToast]);

  const handleResetToDefault = useCallback(() => {
    localStorage.removeItem('network-topology-is-custom');
    localStorage.removeItem('network-topology-dataset-name');
    localStorage.removeItem('network-topology-data');
    setIsCustomDataset(false);
    setActiveDatasetName('Default Topology (1,500 Devices)');
    resetDemo();
    setView('global');
    setMode('graph');
    setActiveBuildingId(null);
    setActiveGroupName(null);
    setSelectedId(null);
    setHighlightIds(null);
    setTick((t) => t + 1);
    showToast('Restored default 1,500-device enterprise topology');
  }, [resetDemo, showToast]);

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
  }, [data, mappingIndex, view, showToast]);



  /* ---------------- derived graphs ---------------- */

  const [globalGraph, setGlobalGraph] = useState(null);
  const [buildingGraph, setBuildingGraph] = useState(null);
  const [groupGraph, setGroupGraph] = useState(null);

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

  useEffect(() => {
    if (data && mappingIndex && activeGroupName) {
      setGroupGraph(buildGroupGraph(activeGroupName, data, mappingIndex, { includeUplinks: includeUplinksInGroup }));
    } else {
      setGroupGraph(null);
    }
  }, [data?.nodes, data?.links, mappingIndex, activeGroupName, includeUplinksInGroup, tick]);

  const graph = view === 'group' ? groupGraph : (view === 'building' ? buildingGraph : globalGraph);

  /* ---------------- filters ---------------- */

  const [filters, setFilters] = useState({
    router: true,
    switch: true,
    up: true,
    down: true,
    critical: true,
    major: true,
    minor: true,
    warning: true,
    normal: true,
    selectedGroup: 'ALL',
  });

  const filteredGraph = useMemo(() => {
    if (!graph) return null;
    const { nodes, edges, positions, ...rest } = graph;

    const filteredNodes = nodes.filter(n => {
      let isRouter = false;
      let isSwitch = false;
      let status = 'up';
      let severity = 'normal';

      if (n.data?.isStandalone) {
        isRouter = n.data.deviceType === 'router';
        isSwitch = n.data.deviceType === 'switch';
        status = n.data.status || 'up';
        severity = n.data.severity || (n.data.stats?.activeAlarmCount > 0 ? 'warning' : 'normal');
      } else if (n.data.kind === 'building') {
        isSwitch = true;
        status = n.data.status; // 'up' or 'down' derived in buildingStats
        severity = n.data.healthLevel || n.data.stats?.worstSeverity || 'normal';
      } else {
        const rawNode = data?.nodesById.get(n.id);
        if (rawNode) {
          isRouter = rawNode.type === 'router';
          isSwitch = rawNode.type === 'switch';
          status = rawNode.status;
          severity = rawNode.severity;
        }
      }

      // Group filter (only filter by dropdown if not in dedicated group view, where graph is already scoped)
      if (view !== 'group' && filters.selectedGroup && filters.selectedGroup !== 'ALL') {
        if (n.data?.isStandalone) {
          // Standalone nodes do not belong to mapped groups, hide if filtering by a specific group
          return false;
        }
        if (n.data.kind === 'building') {
          const bldg = mappingIndex?.buildingsById.get(n.id);
          const hasMember = bldg?.switchIds.some(id => data?.nodesById.get(id)?.groups?.includes(filters.selectedGroup));
          if (!hasMember) return false;
        } else {
          const rawNode = data?.nodesById.get(n.id);
          if (rawNode && rawNode.type === 'switch') {
            if (!Array.isArray(rawNode.groups) || !rawNode.groups.includes(filters.selectedGroup)) {
              return false;
            }
          }
        }
      }

      // Type
      if (isRouter && !filters.router) return false;
      if (isSwitch && !filters.switch) return false;

      // Status
      const st = status?.toLowerCase();
      if ((st === 'up' || st === 'connected') && !filters.up) return false;
      if (st === 'down' && !filters.down) return false;

      // Severity
      const sev = severity?.toLowerCase() || 'normal';
      if (filters[sev] === false) return false;

      return true;
    });

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { ...rest, nodes: filteredNodes, edges: filteredEdges, positions };
  }, [graph, filters, data?.nodesById, mappingIndex, view]);

  /* ---------------- selection ---------------- */

  const selectedBuilding =
    selectedId && mappingIndex?.buildingsById.has(selectedId)
      ? mappingIndex.buildingsById.get(selectedId)
      : null;

  const selectedNode = useMemo(() => {
    if (!selectedId || selectedBuilding) return null;
    if (data?.nodesById.has(selectedId)) return data.nodesById.get(selectedId);
    // Fallback for standalone nodes that exist in graph
    const graphNode = graph?.nodes.find((n) => n.id === selectedId);
    if (graphNode?.data?.isStandalone) {
      return {
        id: graphNode.id,
        name: graphNode.data.name || graphNode.label || graphNode.id,
        type: graphNode.data.deviceType || 'switch',
        tier: 'standalone',
        role: 'standalone',
        status: graphNode.data.status || 'up',
        severity: graphNode.data.severity || (graphNode.data.stats?.activeAlarmCount > 0 ? 'warning' : 'normal'),
        groups: [],
        building: graphNode.data.building || (view === 'building' ? activeBuilding?.name : 'Standalone'),
        isStandalone: true,
        description: graphNode.data.description,
        location: view === 'building' ? activeBuilding?.site || 'Site A' : 'Isolated Rack',
        ipAddress: 'Air-gapped (Unassigned)',
      };
    }
    return null;
  }, [selectedId, selectedBuilding, data?.nodesById, graph, view, activeBuilding]);

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
    if (selectedNode) {
      if (data.alarmsByNode.has(selectedNode.id)) {
        return data.alarmsByNode.get(selectedNode.id) || [];
      }
      if (selectedNode.isStandalone && selectedNode.severity === 'warning') {
        return [
          {
            alarmId: `ALM-${selectedNode.id}-01`,
            nodeId: selectedNode.id,
            severity: 'warning',
            status: 'active',
            message: 'Interface unlinked / standalone unit awaiting uplink configuration',
            raisedAt: data.meta?.generatedAt || new Date().toISOString(),
          },
        ];
      }
      return [];
    }
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

  const goGlobal = useCallback(() => {
    setView('global');
    setActiveBuildingId(null);
    setActiveGroupName(null);
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
      setActiveGroupName(null);
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

  const openGroup = useCallback(
    (groupName, focusNodeId = null) => {
      setView('group');
      setActiveGroupName(groupName);
      setActiveBuildingId(null);
      setSelectedId(focusNodeId);
      setHighlightIds(focusNodeId ? [focusNodeId] : null);
      setFocusRequest({
        ids: focusNodeId ? [focusNodeId] : null,
        mode: focusNodeId ? 'fitThenCenter' : 'fit',
        key: `grpview-${groupName}-${focusNodeId || ''}-${Date.now()}`,
      });
      showToast(`Viewing group: ${groupName}`);
    },
    [showToast]
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

      if (view === 'group' && activeGroupName) {
        if (Array.isArray(node.groups) && node.groups.includes(activeGroupName)) {
          setSelectedId(nodeId);
          setHighlightIds([nodeId]);
          setFocusRequest({ ids: [nodeId], mode: 'fitThenCenter', key: `focus-${nodeId}-${Date.now()}` });
          return;
        }
      }

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
      setActiveGroupName(null);
      setSelectedId(nodeId);
      setHighlightIds([nodeId]);
      setFocusRequest({ ids: [nodeId], mode: 'fitThenCenter', key: `focus-${nodeId}-${Date.now()}` });
    },
    [data, mappingIndex, openBuilding, showToast, view, activeGroupName]
  );

  const handleHighlightGroup = useCallback(
    (groupName, switchIds = null) => {
      if (!data) return;
      const memberIds =
        switchIds ||
        data.nodes
          .filter((n) => Array.isArray(n.groups) && n.groups.includes(groupName))
          .map((n) => n.id);

      if (memberIds.length === 0) {
        showToast(`Group "${groupName}" has no switches.`);
        return;
      }

      const bldgs = new Set();
      memberIds.forEach((id) => {
        const b = mappingIndex?.buildingBySwitchId.get(id);
        if (b) bldgs.add(b.id);
      });

      if (view === 'global') {
        const targetIds = Array.from(bldgs);
        setHighlightIds(targetIds.length > 0 ? targetIds : null);
        setFocusRequest({
          ids: targetIds.length > 0 ? targetIds : null,
          mode: 'fit',
          key: `grp-${groupName}-${Date.now()}`,
        });
      } else {
        setHighlightIds(memberIds);
        setFocusRequest({ ids: memberIds, mode: 'fit', key: `grp-${groupName}-${Date.now()}` });
      }

      showToast(`Viewing group "${groupName}" (${memberIds.length} switches across ${bldgs.size} buildings)`);
    },
    [data, mappingIndex, view, showToast]
  );

  const handleSaveGroup = useCallback(
    (groupName, selectedSwitchIds, originalName = null) => {
      const selectedSet = new Set(selectedSwitchIds);
      updateTopology((raw) => {
        for (const n of raw.nodes) {
          if (n.type !== 'switch') continue;
          if (!Array.isArray(n.groups)) n.groups = [];

          if (originalName && originalName !== groupName) {
            n.groups = n.groups.filter((g) => g !== originalName);
          }

          if (selectedSet.has(n.id)) {
            if (!n.groups.includes(groupName)) {
              n.groups.push(groupName);
            }
          } else {
            n.groups = n.groups.filter((g) => g !== groupName);
          }
        }
      });
      showToast(`Group "${groupName}" saved (${selectedSwitchIds.length} switches)`);
      setTick((t) => t + 1);
    },
    [updateTopology, showToast]
  );

  const handleDeleteGroup = useCallback(
    (groupName) => {
      updateTopology((raw) => {
        for (const n of raw.nodes) {
          if (Array.isArray(n.groups)) {
            n.groups = n.groups.filter((g) => g !== groupName);
          }
        }
      });
      if (activeGroupName === groupName) {
        goGlobal();
      }
      showToast(`Group "${groupName}" deleted`);
      setTick((t) => t + 1);
    },
    [updateTopology, showToast, activeGroupName, goGlobal]
  );

  const handleUpdateNodeGroups = useCallback(
    (nodeId, newGroups) => {
      updateTopology((raw) => {
        const node = raw.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.groups = newGroups;
        }
      });
      showToast(`Updated groups for ${nodeId}`);
      setTick((t) => t + 1);
    },
    [updateTopology, showToast]
  );

  const handleRemoveNodeFromGroup = useCallback(
    (nodeId, groupName) => {
      updateTopology((raw) => {
        const node = raw.nodes.find((n) => n.id === nodeId);
        if (node && Array.isArray(node.groups)) {
          node.groups = node.groups.filter((g) => g !== groupName);
        }
      });
      showToast(`Removed from "${groupName}"`);
      setTick((t) => t + 1);
    },
    [updateTopology, showToast]
  );

  const handleSearchPick = useCallback(
    (entry) => {
      if (entry.kind === 'group') {
        openGroup(entry.groupName);
        return;
      }

      if (entry.kind === 'building') {
        setView('global');
        setMode('graph');
        setActiveBuildingId(null);
        setActiveGroupName(null);
        setSelectedId(entry.buildingId);
        setHighlightIds([entry.buildingId]);
        setFocusRequest({ ids: [entry.buildingId], mode: 'fitThenCenter', key: `find-${entry.buildingId}-${Date.now()}` });
        return;
      }
      
      focusNode(entry.nodeId);
    },
    [focusNode, openGroup]
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
      const nodeToDel = raw.nodes.find(n => n.id === id);
      if (!nodeToDel) return;

      const ifacesToDel = raw.interfaces.filter(i => i.node_id === id);
      const ifaceIds = new Set(ifacesToDel.map(i => i.interface_id));
      
      const linksToDel = raw.links.filter(l => {
        const connectedToSource = l.source === id || ifaceIds.has(l.source_interface_id);
        const connectedToTarget = l.target === id || ifaceIds.has(l.target_interface_id);
        return connectedToSource || connectedToTarget;
      });

      const alarmsToDel = raw.alarms.filter(a => (a.nodeId || a.entity_id) === id);

      setDeletedElements(prev => [...prev, {
        node: nodeToDel,
        interfaces: ifacesToDel,
        links: linksToDel,
        alarms: alarmsToDel,
        deletedAt: new Date().toLocaleTimeString()
      }]);

      raw.nodes = raw.nodes.filter(n => n.id !== id);
      raw.interfaces = raw.interfaces.filter(i => i.node_id !== id);
      raw.links = raw.links.filter(l => !linksToDel.includes(l));
      raw.alarms = raw.alarms.filter(a => !alarmsToDel.includes(a));
      
      if (raw.alarmsByNode) raw.alarmsByNode.delete(id);
      
      // Update the dataset meta count so it doesn't throw a red "mismatch" banner
      if (raw.meta) {
        raw.meta.nodeCount = raw.nodes.length;
      }
      
      showToast(`Deleted node ${id}`);
    });
    setSelectedId(null);
  }, [updateTopology, showToast]);

  const handleRestoreNode = useCallback((idx) => {
    const item = deletedElements[idx];
    if (!item) return;

    updateTopology((raw) => {
      raw.nodes.push(item.node);
      raw.interfaces.push(...item.interfaces);
      raw.links.push(...item.links);
      raw.alarms.push(...item.alarms);

      if (item.alarms.length > 0) {
        if (!raw.alarmsByNode) raw.alarmsByNode = new Map();
        raw.alarmsByNode.set(item.node.id, item.alarms);
      }

      if (raw.meta) {
        raw.meta.nodeCount = raw.nodes.length;
      }

      showToast(`Restored node ${item.node.id}`);
    });

    setDeletedElements(prev => prev.filter((_, i) => i !== idx));
  }, [deletedElements, updateTopology, showToast]);

  const handleReset = useCallback(() => {
    setDeletedElements([]);
    resetDemo();
  }, [resetDemo]);

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
      setGroupGraph(patchNodes);
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
        { key: 'assign-group', label: 'Assign Groups...' },
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
      if (key === 'assign-group') setQuickAssignNode(node);
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
        groupName={activeGroupName}
        mode={mode} 
        onModeChange={setMode} 
        onSimulateAlarm={simulateAlarm} 
        onAddNode={handleAddNode} 
        onOpenGroups={() => { setEditingGroupInitial(null); setIsGroupManagerOpen(true); }}
        groupsCount={data?.groups?.length || 0}
        onToggleAlarms={() => setIsAlarmPanelOpen(o => !o)}
        onReset={handleReset}
        onOpenTrash={() => setIsTrashOpen(true)}
        deletedCount={deletedElements.length}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenLoadModal={() => setIsLoadModalOpen(true)}
        isCustomDataset={isCustomDataset}
      >
        <SearchBar data={data} mappingIndex={mappingIndex} onPick={handleSearchPick} />
      </Header>

      <div className="top-bars" style={{ display: 'flex', flexDirection: 'column' }}>
        {validation && !validation.ok && (
          <div className="validation-banner" style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '4px 12px' }}>
            Device count mismatch — expected {validation.expectedDevices}, found {validation.actualDevices}.
          </div>
        )}

        {validation && (validation.missingNodeCount > 0 || validation.unresolvedLinkCount > 0) && (
          <div className="validation-banner" style={{ backgroundColor: '#eab308', color: '#000', padding: '4px 12px' }}>
            <strong>Data Anomalies Safely Handled:</strong> Auto-generated {validation.missingNodeCount} missing nodes referenced by links. Ignored {validation.unresolvedLinkCount} orphan links.
          </div>
        )}

        <Breadcrumbs
          building={activeBuilding}
          group={view === 'group' ? { name: activeGroupName } : null}
          node={(view === 'building' || view === 'group') ? selectedNode : null}
          onGoGlobal={goGlobal}
          onGoBuilding={(id) => openBuilding(id)}
          onGoGroup={(name) => openGroup(name)}
        />
      </div>

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
              <FilterPanel filters={filters} onChange={setFilters} availableGroups={data?.groups || []} />
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
                      {data?.nodesById.get(hovered.id)?.ipAddress || hovered.data?.ipAddress || 'Standalone · Air-gapped'} ·{' '}
                      {data?.nodesById.get(hovered.id)?.status || hovered.data?.status || 'up'} ·{' '}
                      {data?.nodesById.get(hovered.id)?.location || hovered.data?.location || 'Isolated'}
                    </span>
                  )}
                </div>
              )}
              <ZoomControls
                onZoomIn={() => graphRef.current?.zoomIn()}
                onZoomOut={() => graphRef.current?.zoomOut()}
                onFit={() => graphRef.current?.fit()}
                onOpenHelp={() => setIsHelpOpen(true)}
              />
              <Legend view={view} />
              {view === 'building' && buildingGraph && (
                <div className="viewbadge">
                  {activeBuilding.name} · {activeBuilding.switchIds.length} switches ·{' '}
                  {buildingGraph.uplinkRouterIds.length} uplink routers
                </div>
              )}
              {view === 'group' && groupGraph && (
                <div className="viewbadge group-viewbadge">
                  <span className="group-badge-icon">📁</span>
                  <span>
                    <b>{groupGraph.groupName}</b> · {groupGraph.switchCount} switches across {groupGraph.buildingsCount} building{groupGraph.buildingsCount === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className={`btn-uplink-toggle ${includeUplinksInGroup ? 'active' : ''}`}
                    onClick={() => setIncludeUplinksInGroup((v) => !v)}
                    title={includeUplinksInGroup ? 'Hide uplink distribution routers' : 'Show uplink distribution routers'}
                  >
                    {includeUplinksInGroup ? '✓ With Uplinks' : '+ Switches Only'}
                  </button>
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
          groupName={view === 'group' ? activeGroupName : null}
          groupStats={view === 'group' && groupGraph ? groupGraph.stats : null}
          onOpenGroup={openGroup}
          onEditGroup={(name) => {
            setEditingGroupInitial(name);
            setIsGroupManagerOpen(true);
          }}
          onSelectNode={(id) => {
            setSelectedId(id);
            setHighlightIds([id]);
            setFocusRequest({ ids: [id], mode: 'fitThenCenter', key: `sw-${id}-${Date.now()}` });
          }}
          onGoGlobal={goGlobal}
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
          onAddToGroup={(n) => setQuickAssignNode(n)}
          onRemoveFromGroup={handleRemoveNodeFromGroup}
          onHighlightGroup={handleHighlightGroup}
          data={data}
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
          data={data}
          onSave={handleSaveLink}
          onClose={() => {
            setEditingLinkNode(null);
            setEditingLinkBundle(null);
          }}
        />
      )}
      {isTrashOpen && (
        <TrashModal 
          isOpen={isTrashOpen} 
          onClose={() => setIsTrashOpen(false)} 
          deletedElements={deletedElements} 
          onRestore={handleRestoreNode} 
        />
      )}
      {isGroupManagerOpen && (
        <GroupManagerModal
          isOpen={isGroupManagerOpen}
          onClose={() => {
            setIsGroupManagerOpen(false);
            setEditingGroupInitial(null);
          }}
          data={data}
          mappingIndex={mappingIndex}
          onSaveGroup={handleSaveGroup}
          onDeleteGroup={handleDeleteGroup}
          onHighlightGroup={handleHighlightGroup}
          onOpenGroup={openGroup}
          initialEditingGroup={editingGroupInitial}
          tick={tick}
        />
      )}
      {quickAssignNode && (
        <QuickAssignGroupModal
          node={quickAssignNode}
          allGroups={data?.groups || []}
          onSave={handleUpdateNodeGroups}
          onOpenFullManager={() => {
            setQuickAssignNode(null);
            setEditingGroupInitial(null);
            setIsGroupManagerOpen(true);
          }}
          onClose={() => setQuickAssignNode(null)}
        />
      )}
      {isHelpOpen && (
        <HelpModal
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
      )}
      {isLoadModalOpen && (
        <LoadTopologyModal
          isOpen={isLoadModalOpen}
          onClose={() => setIsLoadModalOpen(false)}
          onLoadCustom={handleLoadCustom}
          onResetDefault={handleResetToDefault}
          isCustomLoaded={isCustomDataset}
          activeDatasetName={activeDatasetName}
        />
      )}
    </div>
  );
}
