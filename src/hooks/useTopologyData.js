import { useEffect, useState } from 'react';

/**
 * Fetches /network-topology-dataset.json (see public/) and derives the
 * lookup structures the canvas + details panel need:
 *  - nodesById:      Map<nodeId, node>
 *  - resolvedLinks:  [{ ...link, a: nodeIdA, b: nodeIdB }]   (interface ids resolved to node ids)
 *  - linksByNode:    Map<nodeId, resolvedLink[]>             (for hover/selection highlighting)
 *  - alarmsByNode:   Map<nodeId, alarm[]>
 *
 * Swap the fetch() call for a real API request when you move off the
 * generated sample dataset — everything downstream only depends on this
 * shape, not on where it came from.
 */
export function useTopologyData(url = '/network-topology-dataset.json') {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        if (cancelled) return;

        const nodesById = new Map(raw.nodes.map((n) => [n.id, n]));
        const ifaceToNode = new Map(raw.interfaces.map((i) => [i.interface_id, i.node_id]));

        const alarmsByNode = new Map();
        for (const a of raw.alarms) {
          if (!alarmsByNode.has(a.nodeId)) alarmsByNode.set(a.nodeId, []);
          alarmsByNode.get(a.nodeId).push(a);
        }

        const resolvedLinks = [];
        const linksByNode = new Map();
        for (const l of raw.links) {
          const a = ifaceToNode.get(l.source_interface_id);
          const b = ifaceToNode.get(l.target_interface_id);
          if (!a || !b || !nodesById.has(a) || !nodesById.has(b)) continue;
          const rl = { ...l, a, b };
          resolvedLinks.push(rl);
          if (!linksByNode.has(a)) linksByNode.set(a, []);
          if (!linksByNode.has(b)) linksByNode.set(b, []);
          linksByNode.get(a).push(rl);
          linksByNode.get(b).push(rl);
        }

        setState({
          loading: false,
          error: null,
          data: {
            meta: raw.meta,
            nodes: raw.nodes,
            nodesById,
            resolvedLinks,
            linksByNode,
            alarmsByNode,
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => { cancelled = true; };
  }, [url]);

  return state;
}
