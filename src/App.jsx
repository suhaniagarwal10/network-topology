import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTopologyData } from './hooks/useTopologyData';
import { useBuildingMapping } from './hooks/useBuildingMapping';
import { buildBuildingGraph, buildGlobalGraph, buildGroupGraph, computeBuildingStats, getNodeLabel } from './utils/topologyTransform';
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
import SettingsModal from './components/SettingsModal';
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

  const savedUiState = useMemo(() => {
    try {
      const raw = localStorage.getItem('network_topology_ui_state');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  // 'global'  -> core routers / distribution routers / buildings
  // 'building'-> the individual switches inside one building
  // 'group'   -> only the switches belonging to a selective multi-building group
  const [view, setView] = useState(() => savedUiState?.view || 'global');
  const [mode, setMode] = useState(() => savedUiState?.mode || 'graph'); // global view only: graph | cards
  const [activeBuildingId, setActiveBuildingId] = useState(() => savedUiState?.activeBuildingId || null);
  const [activeGroupName, setActiveGroupName] = useState(() => savedUiState?.activeGroupName || null);
  const [includeUplinksInGroup, setIncludeUplinksInGroup] = useState(() =>
    savedUiState?.includeUplinksInGroup !== undefined ? savedUiState.includeUplinksInGroup : true
  );
  const [selectedId, setSelectedId] = useState(() => savedUiState?.selectedId || null);
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => savedUiState?.settings || {
    nodeLabel: 'name',
    interfaceLabel: 'name',
  });
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

  const graphRef = useRef(null);

  const handleLoadCustom = useCallback((rawPayload) => {
    const name = rawPayload.meta?.name || 'Custom Dataset';
    localStorage.setItem('network-topology-is-custom', 'true');
    localStorage.setItem('network-topology-dataset-name', name);
    localStorage.setItem('network-topology-data', JSON.stringify(rawPayload));
    localStorage.removeItem('network_topology_ui_state');
    graphRef.current?.clearDraggedPositions?.();
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
    localStorage.removeItem('network_topology_ui_state');
    graphRef.current?.clearDraggedPositions?.();
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

  const simulateAlarm = useCallback(() => {
    if (!data) return;
    const switches = data.nodes.filter(n => n.type === 'switch');
    if (switches.length === 0) return;
    const target = switches[Math.floor(Math.random() * switches.length)];
    const newAlarm = {
      alarmId: `A-${Date.now()}`,
      nodeId: target.id,
      status: 'active',
      severity: 'critical',
      description: 'Simulated interactive alarm spike!',
      raisedAt: new Date().toISOString()
    };

    updateTopology((raw) => {
      if (!Array.isArray(raw.alarms)) raw.alarms = [];
      raw.alarms.push(newAlarm);
      const rawNode = raw.nodes.find((n) => n.id === target.id);
      if (rawNode) {
        rawNode.severity = 'critical';
      }
    });

    // Force a re-render and re-computation of graphs by updating tick
    setTick(t => t + 1);
    
    // Highlight the building/node in-place without zooming out the camera
    const building = mappingIndex?.buildingBySwitchId.get(target.id);
    if (building) {
      if (view === 'global') {
        setSelectedId(building.id);
        setHighlightIds([building.id]);
      }
      showToast(`⚠️ Simulated Alarm triggered in ${building.name} on ${target.name}!`);
    } else {
      showToast(`⚠️ Simulated Alarm triggered on ${target.name}!`);
    }
  }, [data, mappingIndex, view, showToast, updateTopology]);



  /* ---------------- derived graphs ---------------- */

  const [globalGraph, setGlobalGraph] = useState(null);
  const [buildingGraph, setBuildingGraph] = useState(null);
  const [groupGraph, setGroupGraph] = useState(null);

  const activeBuilding = activeBuildingId ? mappingIndex?.buildingsById.get(activeBuildingId) : null;

  // Full rebuilds on structural changes only (initial load, add/delete nodes, simulate alarm)
  useEffect(() => {
    if (data && mappingIndex) {
      setGlobalGraph(buildGlobalGraph(data, mappingIndex, settings));
    }
  }, [data?.nodes, data?.resolvedLinks, mappingIndex, tick, settings]);

  useEffect(() => {
    if (data && mappingIndex && activeBuilding) {
      setBuildingGraph(buildBuildingGraph(activeBuilding, data, mappingIndex, settings));
    } else {
      setBuildingGraph(null);
    }
  }, [data?.nodes, data?.resolvedLinks, mappingIndex, activeBuildingId, tick, settings]);

  useEffect(() => {
    if (data && mappingIndex && activeGroupName) {
      setGroupGraph(buildGroupGraph(activeGroupName, data, mappingIndex, { includeUplinks: includeUplinksInGroup }, settings));
    } else {
      setGroupGraph(null);
    }
  }, [data?.nodes, data?.resolvedLinks, mappingIndex, activeGroupName, includeUplinksInGroup, tick, settings]);

  const graph = view === 'group' ? groupGraph : (view === 'building' ? buildingGraph : globalGraph);

  useEffect(() => {
    if (!data || !mappingIndex) return;
    if (view === 'building' && (!activeBuildingId || !mappingIndex.buildingsById.has(activeBuildingId))) {
      setView('global');
      setActiveBuildingId(null);
    } else if (view === 'group' && !activeGroupName) {
      setView('global');
    }
  }, [data, mappingIndex, view, activeBuildingId, activeGroupName]);

  /* ---------------- filters ---------------- */

  const [filters, setFilters] = useState(() => savedUiState?.filters || {
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

  useEffect(() => {
    try {
      localStorage.setItem(
        'network_topology_ui_state',
        JSON.stringify({
          view,
          mode,
          activeBuildingId,
          activeGroupName,
          includeUplinksInGroup,
          selectedId,
          settings,
          filters,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [view, mode, activeBuildingId, activeGroupName, includeUplinksInGroup, selectedId, settings, filters]);

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
          if (rawNode) {
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

  const lastFocusKeyRef = useRef(null);

  // Focus is deferred a tick so Reagraph has laid the new graph out before we
  // ask the camera to frame something in it. Guarded by lastFocusKeyRef so
  // subsequent graph data updates never re-trigger an old fit/zoom-out.
  useEffect(() => {
    if (!focusRequest || !graph) return;
    if (lastFocusKeyRef.current === focusRequest.key) return;

    const timers = [];
    timers.push(
      setTimeout(() => {
        lastFocusKeyRef.current = focusRequest.key;
        const { ids, mode } = focusRequest;
        if (mode === 'fitThenCenter') {
          graphRef.current?.fit();
          timers.push(setTimeout(() => graphRef.current?.center(ids), 420));
        } else if (mode === 'center') {
          graphRef.current?.center(ids || undefined);
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
          setFocusRequest({ ids: [nodeId], mode: 'center', key: `focus-${nodeId}-${Date.now()}` });
          return;
        }
      }

      if (node.type === 'switch') {
        const building = mappingIndex.buildingBySwitchId.get(nodeId);
        if (building) {
          if (view === 'building' && activeBuildingId === building.id) {
            setSelectedId(nodeId);
            setHighlightIds([nodeId]);
            setFocusRequest({ ids: [nodeId], mode: 'center', key: `focus-${nodeId}-${Date.now()}` });
          } else {
            openBuilding(building.id, nodeId);
            setHighlightIds([nodeId]);
          }
          showToast(`${node.name || nodeId} — ${building.name}`);
          return;
        }
      }

      const wasGlobalGraph = view === 'global' && mode === 'graph';
      setView('global');
      setMode('graph');
      setActiveBuildingId(null);
      setActiveGroupName(null);
      setSelectedId(nodeId);
      setHighlightIds([nodeId]);
      setFocusRequest({
        ids: [nodeId],
        mode: wasGlobalGraph ? 'center' : 'fitThenCenter',
        key: `focus-${nodeId}-${Date.now()}`,
      });
    },
    [data, mappingIndex, openBuilding, showToast, view, mode, activeBuildingId, activeGroupName]
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
        showToast(`Group "${groupName}" has no members.`);
        return;
      }

      const bldgs = new Set();
      const directIds = new Set();
      memberIds.forEach((id) => {
        const b = mappingIndex?.buildingBySwitchId.get(id);
        if (b) bldgs.add(b.id);
        else directIds.add(id);
      });

      if (view === 'global') {
        const targetIds = [...bldgs, ...directIds];
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

      showToast(`Viewing group "${groupName}" (${memberIds.length} device${memberIds.length === 1 ? '' : 's'})`);
    },
    [data, mappingIndex, view, showToast]
  );

  const handleSaveGroup = useCallback(
    (groupName, selectedSwitchIds, originalName = null) => {
      const selectedSet = new Set(selectedSwitchIds);
      updateTopology((raw) => {
        for (const n of raw.nodes) {
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
      showToast(`Group "${groupName}" saved (${selectedSwitchIds.length} device${selectedSwitchIds.length === 1 ? '' : 's'})`);
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
        const wasGlobalGraph = view === 'global' && mode === 'graph';
        setView('global');
        setMode('graph');
        setActiveBuildingId(null);
        setActiveGroupName(null);
        setSelectedId(entry.buildingId);
        setHighlightIds([entry.buildingId]);
        setFocusRequest({
          ids: [entry.buildingId],
          mode: wasGlobalGraph ? 'center' : 'fitThenCenter',
          key: `find-${entry.buildingId}-${Date.now()}`,
        });
        return;
      }
      
      focusNode(entry.nodeId);
    },
    [focusNode, openGroup, view, mode]
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
      // Collect existing group names across all nodes (case-insensitive map -> canonical name)
      const existingGroupsMap = new Map();
      for (const n of raw.nodes) {
        if (Array.isArray(n.groups)) {
          for (const g of n.groups) {
            if (typeof g === 'string' && g.trim()) {
              existingGroupsMap.set(g.trim().toLowerCase(), g.trim());
            }
          }
        }
      }

      const normalizedGroups = [];
      const createdGroups = [];
      for (const rawG of (Array.isArray(nodeData.groups) ? nodeData.groups : [])) {
        const trimmed = typeof rawG === 'string' ? rawG.trim() : '';
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        const canonical = existingGroupsMap.get(lower) || trimmed;
        if (!existingGroupsMap.has(lower)) {
          createdGroups.push(canonical);
          existingGroupsMap.set(lower, canonical);
        }
        if (!normalizedGroups.includes(canonical)) {
          normalizedGroups.push(canonical);
        }
      }

      const idx = raw.nodes.findIndex(n => n.id === nodeData.id);
      const defaultSeverity = nodeData.status === 'down'
        ? 'critical'
        : nodeData.status === 'connecting'
        ? 'warning'
        : 'normal';
      const normalizedTier = nodeData.type === 'router' && (!nodeData.tier || nodeData.tier === 'access')
        ? 'distribution'
        : nodeData.tier;

      const groupSuffix = createdGroups.length > 0
        ? ` & created group "${createdGroups.join(', ')}"`
        : normalizedGroups.length > 0
        ? ` in group "${normalizedGroups.join(', ')}"`
        : '';

      if (idx >= 0) {
        raw.nodes[idx] = {
          ...raw.nodes[idx],
          ...nodeData,
          groups: normalizedGroups,
          tier: normalizedTier,
          severity: raw.nodes[idx].severity || defaultSeverity,
        };
        showToast(`Updated node ${nodeData.id}${groupSuffix}`);
      } else {
        raw.nodes.push({
          ...nodeData,
          groups: normalizedGroups,
          tier: normalizedTier,
          severity: nodeData.severity || defaultSeverity,
        });
        if (raw.meta) {
          raw.meta.nodeCount = raw.nodes.length;
        }
        showToast(`Added node ${nodeData.id}${groupSuffix}`);
      }
    });
    setIsNodeModalOpen(false);
    setHighlightIds(null);
    setSelectedId(nodeData.id);
    setTick((t) => t + 1);
  }, [updateTopology, showToast]);

  const handleSaveLink = useCallback((linkPayload) => {
    let sourceId, targetId;
    updateTopology((raw) => {
      if (linkPayload.isEdit) {
        let count = 0;
        for (let i = 0; i < raw.links.length; i++) {
          if (linkPayload.linkIds.includes(raw.links[i].link_id)) {
            raw.links[i].bandwidth_mbps = linkPayload.bandwidth_mbps;
            raw.links[i].status = linkPayload.status;
            sourceId = raw.links[i].source;
            targetId = raw.links[i].target;
            count++;
          }
        }
        showToast(`Updated ${count} link(s) in bundle`);
      } else {
        const { isEdit, ...newLink } = linkPayload;
        raw.links.push(newLink);
        sourceId = newLink.source;
        targetId = newLink.target;
        showToast(`Added link from ${sourceId} to ${targetId}`);
      }
    });
    setEditingLinkNode(null);
    setEditingLinkBundle(null);
    if (sourceId && targetId) {
      setHighlightIds([sourceId, targetId]);
    }
    setTick((t) => t + 1);
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
    setTick((t) => t + 1);
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
    setTick((t) => t + 1);
  }, [deletedElements, updateTopology, showToast]);

  const handleReset = useCallback(() => {
    setDeletedElements([]);
    localStorage.removeItem('network_topology_ui_state');
    graphRef.current?.clearDraggedPositions?.();
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
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        <SearchBar data={data} mappingIndex={mappingIndex} onPick={handleSearchPick} settings={settings} />
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
          settings={settings}
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
                viewKey={`${view}:${activeBuildingId || ''}:${activeGroupName || ''}`}
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
              {hovered && (() => {
                const getNodeDisplay = (nodeId) => {
                  const node = data?.nodesById.get(nodeId);
                  if (!node) return hovered?.label || nodeId;
                  return getNodeLabel(node, settings);
                };
                return (
                  <div className="hoverchip">
                    <b>{hovered.data?.kind === 'link' ? 'Link Details' : (hovered.data?.kind === 'building' ? (hovered.label || hovered.id) : getNodeDisplay(hovered.id))}</b>
                    {hovered.data?.kind === 'building' ? (
                      <span>
                        {hovered.data.stats.total} switches · {hovered.data.stats.connected} connected ·{' '}
                        {hovered.data.stats.activeAlarmCount} active alarms
                      </span>
                    ) : hovered.data?.kind === 'link' ? (
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: 600 }}>{getNodeDisplay(hovered.source)} ↔ {getNodeDisplay(hovered.target)}</span>
                        <span>
                          {hovered.data.count} link{hovered.data.count !== 1 ? 's' : ''} ·{' '}
                        {hovered.data.bandwidthMbps >= 1000 
                          ? `${(hovered.data.bandwidthMbps / 1000).toFixed(1).replace('.0', '')} Gbps` 
                          : `${hovered.data.bandwidthMbps} Mbps`}
                        {hovered.data.downCount > 0 ? ` · ${hovered.data.downCount} down` : ''}
                      </span>
                      {hovered.data.interfaceDetails && (
                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{hovered.data.interfaceDetails}</span>
                      )}
                    </span>
                  ) : (
                    <span>
                      {data?.nodesById.get(hovered.id)?.ipAddress || hovered.data?.ipAddress || 'Standalone · Air-gapped'} ·{' '}
                      {data?.nodesById.get(hovered.id)?.status || hovered.data?.status || 'up'} ·{' '}
                      {data?.nodesById.get(hovered.id)?.location || hovered.data?.location || 'Isolated'}
                    </span>
                  )}
                </div>
              );
              })()}
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
            setFocusRequest({ ids: [id], mode: 'center', key: `sw-${id}-${Date.now()}` });
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
          settings={settings}
          now={DATASET_NOW}
        />
      </main>
      
      {isNodeModalOpen && (
        <NodeModal
          node={editingNode}
          data={data}
          availableGroups={data?.groups || []}
          onSave={handleSaveNode}
          onClose={() => setIsNodeModalOpen(false)}
        />
      )}
      
      {viewingLinksNode && (
        <LinkModal
          nodeName={data?.nodesById.get(viewingLinksNode) ? getNodeLabel(data.nodesById.get(viewingLinksNode), settings) : viewingLinksNode}
          links={data?.linksByNode.get(viewingLinksNode) || []}
          data={data}
          settings={settings}
          onClose={() => setViewingLinksNode(null)}
        />
      )}
      
      {viewingInterfacesNode && (
        <InterfaceModal
          nodeName={data?.nodesById.get(viewingInterfacesNode) ? getNodeLabel(data.nodesById.get(viewingInterfacesNode), settings) : viewingInterfacesNode}
          interfaces={data?.interfacesByNode.get(viewingInterfacesNode) || []}
          nodeSeverity={data?.nodesById.get(viewingInterfacesNode)?.severity}
          nodeStatus={data?.nodesById.get(viewingInterfacesNode)?.status}
          settings={settings}
          onClose={() => setViewingInterfacesNode(null)}
        />
      )}
      
      {isAlarmPanelOpen && (
        <AlarmPanel
          alarms={allAlarms}
          data={data}
          settings={settings}
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
          settings={settings}
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
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={(newSettings) => {
            setSettings(newSettings);
            showToast('Display settings updated');
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
