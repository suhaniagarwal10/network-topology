import { useEffect, useState } from 'react';

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

        const interfacesByNode = new Map();
        for (const i of raw.interfaces) {
          if (!interfacesByNode.has(i.node_id)) interfacesByNode.set(i.node_id, []);
          interfacesByNode.get(i.node_id).push(i);
        }

        const alarmsByNode = new Map();
        for (const a of raw.alarms) {
          if (!alarmsByNode.has(a.nodeId)) alarmsByNode.set(a.nodeId, []);
          alarmsByNode.get(a.nodeId).push(a);
        }

        const resolvedLinks = [];
        const linksByNode = new Map();
        const uplinkRoutersBySwitch = new Map();
        let unresolvedLinkCount = 0;

        for (const l of raw.links) {
          const a = ifaceToNode.get(l.source_interface_id);
          const b = ifaceToNode.get(l.target_interface_id);
          if (!a || !b || !nodesById.has(a) || !nodesById.has(b)) {
            unresolvedLinkCount += 1;
            continue;
          }
          const rl = { ...l, a, b };
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

        // Development guard rail — the device count must never change as a
        // side effect of the building grouping layer.
        console.log('Actual network devices:', actualDevices);
        if (!validation.ok) {
          console.error(
            `Device count mismatch: expected ${validation.expectedDevices}, got ${actualDevices}. ` +
              'The building layer must never add to or remove from the node dataset.'
          );
        }
        if (unresolvedLinkCount > 0) {
          console.warn(`${unresolvedLinkCount} link(s) could not be resolved to nodes.`);
        }

        setState({
          loading: false,
          error: null,
          data: {
            meta: raw.meta,
            nodes: raw.nodes,
            nodesById,
            interfaces: raw.interfaces,
            interfacesByNode,
            resolvedLinks,
            linksByNode,
            alarmsByNode,
            uplinkRoutersBySwitch,
            validation,
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
