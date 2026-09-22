import { useEffect, useState, useRef } from 'react';

/**
 * Fetches /network-topology-dataset.json (see public/) and derives the
 * lookup structures the canvas + details panel need:
 *  - nodesById:             Map<nodeId, node>
 *  - interfacesByNode:      Map<nodeId, interface[]>
 *  - resolvedLinks:         [{ ...link, a: nodeIdA, b: nodeIdB }]  (interface ids resolved to node ids)
 *  - linksByNode:           Map<nodeId, resolvedLink[]>            (for hover/selection highlighting)
 *  - alarmsByNode:          Map<nodeId, alarm[]>
 *  - uplinkRoutersBySwitch: Map<switchId, routerId[]>              (feeds the building mapper)
 *
 * IMPORTANT: `nodes` is passed through untouched. Interfaces are supporting
 * data and are deliberately NOT turned into graph nodes, and the building
 * grouping layer lives entirely outside this hook — so the dataset always
 * keeps all 1,500 actual routers + switches.
 *
 * Swap the fetch() call for a real API request when you move off the
 * generated sample dataset — everything downstream only depends on this
 * shape, not on where it came from.
 */
export function parseRawTopologyData(raw) {
  const nodesById = new Map(raw.nodes.map((n) => [n.id || n.node_id, n]));
  // CSV might use node_id or id, let's normalize to id
  raw.nodes.forEach(n => { n.id = n.id || n.node_id; n.type = n.type || n.node_type?.toLowerCase() || 'switch'; });

  const ifaceToNode = new Map(raw.interfaces.map((i) => [i.interface_id, i.node_id]));

  const interfacesByNode = new Map();
  for (const i of raw.interfaces) {
    if (!interfacesByNode.has(i.node_id)) interfacesByNode.set(i.node_id, []);
    interfacesByNode.get(i.node_id).push(i);
  }

  const alarmsByNode = new Map();
  for (const a of raw.alarms) {
    const nodeId = a.nodeId || a.entity_id; // Support both JSON and CSV formats
    if (!alarmsByNode.has(nodeId)) alarmsByNode.set(nodeId, []);
    alarmsByNode.get(nodeId).push({...a, status: a.status || 'active', severity: a.severity?.toLowerCase() || 'critical'});
  }

  const resolvedLinks = [];
  const linksByNode = new Map();
  const uplinkRoutersBySwitch = new Map();
  let unresolvedLinkCount = 0;

  const missingNodeIds = new Set();
  const getOrAddMissingNode = (id) => {
    if (!id) return null;
    if (!nodesById.has(id)) {
      const missingNode = {
        id,
        name: `Missing: ${id}`,
        type: 'switch',
        status: 'DOWN',
        severity: 'critical',
        tier: 'access',
        location: 'Unknown',
        isMissing: true
      };
      nodesById.set(id, missingNode);
      raw.nodes.push(missingNode);
      missingNodeIds.add(id);
    }
    return id;
  };

  for (const l of raw.links) {
    let a = ifaceToNode.get(l.source_interface_id) || l.source;
    let b = ifaceToNode.get(l.target_interface_id) || l.target;
    
    a = getOrAddMissingNode(a);
    b = getOrAddMissingNode(b);
    
    if (!a || !b) {
      unresolvedLinkCount += 1;
      continue;
    }
    const rl = { ...l, a, b, link_id: l.link_id || `L-${a}-${b}` };
    resolvedLinks.push(rl);
    if (!linksByNode.has(a)) linksByNode.set(a, []);
    if (!linksByNode.has(b)) linksByNode.set(b, []);
    linksByNode.get(a).push(rl);
    linksByNode.get(b).push(rl);

    // Remember switch -> distribution-router uplinks; the building
    // mapping rules can select switches by the routers they feed into.
    const na = nodesById.get(a);
    const nb = nodesById.get(b);
    for (const [sw, other] of [
      [na, nb],
      [nb, na],
    ]) {
      if (sw.type !== 'switch' || other.type !== 'router') continue;
      if (!uplinkRoutersBySwitch.has(sw.id)) uplinkRoutersBySwitch.set(sw.id, []);
      const list = uplinkRoutersBySwitch.get(sw.id);
      if (!list.includes(other.id)) list.push(other.id);
    }
  }

  const routers = raw.nodes.filter((n) => n.type === 'router');
  const switches = raw.nodes.filter((n) => n.type === 'switch');
  const actualDevices = routers.length + switches.length;

  const validation = {
    totalNodes: raw.nodes.length,
    actualDevices,
    routerCount: routers.length,
    switchCount: switches.length,
    coreCount: raw.nodes.filter((n) => n.tier === 'core').length,
    distributionCount: raw.nodes.filter((n) => n.tier === 'distribution').length,
    interfaceCount: raw.interfaces.length,
    linkCount: raw.links.length,
    resolvedLinkCount: resolvedLinks.length,
    unresolvedLinkCount,
    alarmCount: raw.alarms.length,
    expectedDevices: raw.meta?.nodeCount ?? raw.nodes.length,
    ok: actualDevices === (raw.meta?.nodeCount ?? raw.nodes.length),
  };

  console.log('Actual network devices:', actualDevices);
  if (!validation.ok) {
    console.error(
      `Device count mismatch: expected ${validation.expectedDevices}, got ${actualDevices}. ` +
        'The building layer must never add to or remove from the node dataset.'
    );
  }
  if (unresolvedLinkCount > 0) {
    console.warn(`${unresolvedLinkCount} link(s) could not be resolved to nodes because their source/target was entirely undefined.`);
  }
  if (missingNodeIds.size > 0) {
    console.warn(`Generated ${missingNodeIds.size} missing placeholder node(s) referenced by links but missing from the nodes dataset:`, Array.from(missingNodeIds));
  }

  return {
    meta: raw.meta || { nodeCount: actualDevices, generatedAt: new Date().toISOString() },
    nodes: raw.nodes,
    nodesById,
    interfaces: raw.interfaces,
    interfacesByNode,
    resolvedLinks,
    linksByNode,
    alarmsByNode,
    uplinkRoutersBySwitch,
    validation,
  };
}

export function useTopologyData(url = '/network-topology-dataset.json') {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const rawRef = useRef(null);

  useEffect(() => {
    loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const loadFromRaw = (raw) => {
    try {
      rawRef.current = raw;
      const data = parseRawTopologyData(raw);
      setState({ loading: false, error: null, data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  };

  const updateTopology = (updater) => {
    if (!rawRef.current) return;
    try {
      updater(rawRef.current);
      // Re-parse with the mutated raw data
      const data = parseRawTopologyData(rawRef.current);
      
      // Persist changes across refreshes
      localStorage.setItem('network-topology-data', JSON.stringify(rawRef.current));
      
      setState({ loading: false, error: null, data });
    } catch (err) {
      console.error('Failed to update topology:', err);
    }
  };

  const loadDemo = () => {
    setState({ loading: true, error: null, data: null });
    
    // Check if we have a persisted session from previous edits/alarm resolutions
    const saved = localStorage.getItem('network-topology-data');
    if (saved) {
      try {
        const raw = JSON.parse(saved);
        loadFromRaw(raw);
        return;
      } catch (err) {
        console.warn('Failed to parse saved topology, falling back to original demo', err);
        localStorage.removeItem('network-topology-data');
      }
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        loadFromRaw(raw);
      })
      .catch((err) => {
        setState({ loading: false, error: err.message, data: null });
      });
  };
  
  const resetDemo = () => {
    localStorage.removeItem('network-topology-data');
    loadDemo();
  };

  return { ...state, loadFromRaw, loadDemo, updateTopology, resetDemo };
}
