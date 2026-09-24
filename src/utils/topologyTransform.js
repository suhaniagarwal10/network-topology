/**
 * Turns the raw dataset + building mapping into the two graphs the UI draws.
 *
 *   raw JSON -> useTopologyData -> building mapping -> THIS FILE -> Reagraph
 *
 * Two outputs:
 *   buildGlobalGraph()   core routers -> distribution routers -> buildings
 *                        (switch links aggregated onto their building)
 *   buildBuildingGraph() one building's individual switches + their real links
 *
 * Nothing here mutates the dataset. Buildings only ever appear as *graph*
 * nodes; they are never written back into `data.nodes`.
 */
import { buildingHealthLevel, severityColor, worstSeverity, bwLabel } from './graph.js';

/* ------------------------------------------------------------------ *
 * Layout constants. Reagraph works in world units; these are tuned so a
 * 180-node global view fits comfortably and reads as distinct tiers.
 * ------------------------------------------------------------------ */
const LAYOUT = {
  backboneY: 400, // core routers that span sites
  coreY: 250, // core routers anchored to one site
  distTopY: 100,
  distRowGap: 35,
  routersPerRow: 4,
  routerGap: 30,
  buildingY: -180,
  colWidth: 100, // one building + the uplink routers stacked above it
  colGap: 30,
  siteGap: 100,
  coreGap: 90,
};

export const NODE_SIZE = {
  core: 9,
  distribution: 3,
  building: 8,
  switch: 9,
  external: 6,
};

/* ------------------------------------------------------------------ *
 * Health aggregation
 * ------------------------------------------------------------------ */

/**
 * Roll a building's switches up into the summary shown on its card and node.
 * Every number here is counted from the real dataset — nothing is invented.
 */
export function computeBuildingStats(building, data) {
  const stats = {
    total: building.switchIds.length,
    connected: 0,
    connecting: 0,
    down: 0,
    severity: { normal: 0, minor: 0, warning: 0, major: 0, critical: 0 },
    alarmCount: 0,
    activeAlarmCount: 0,
    linkCount: 0,
    downLinkCount: 0,
    worstSeverity: 'normal',
  };

  const seenLinks = new Set();
  const severities = [];

  for (const id of building.switchIds) {
    const node = data.nodesById.get(id);
    if (!node) continue;

    if (node.status === 'down') stats.down += 1;
    else if (node.status === 'connecting') stats.connecting += 1;
    else stats.connected += 1;

    if (stats.severity[node.severity] !== undefined) stats.severity[node.severity] += 1;
    severities.push(node.severity);

    const alarms = data.alarmsByNode.get(id) || [];
    stats.alarmCount += alarms.length;
    stats.activeAlarmCount += alarms.filter((a) => a.status === 'active').length;

    for (const link of data.linksByNode.get(id) || []) {
      if (seenLinks.has(link.link_id)) continue;
      seenLinks.add(link.link_id);
      stats.linkCount += 1;
      if (link.status === 'down') stats.downLinkCount += 1;
    }
  }

  stats.worstSeverity = worstSeverity(severities);
  return stats;
}

/** Same idea for a single device, so the details panel and nodes agree. */
export function computeDeviceStats(node, data) {
  const alarms = data.alarmsByNode.get(node.id) || [];
  const links = data.linksByNode.get(node.id) || [];
  return {
    alarmCount: alarms.length,
    activeAlarmCount: alarms.filter((a) => a.status === 'active').length,
    linkCount: links.length,
    downLinkCount: links.filter((l) => l.status === 'down').length,
  };
}

/* ------------------------------------------------------------------ *
 * Shared edge aggregation
 * ------------------------------------------------------------------ */

function aggregateKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Collapse many real links into one drawn edge.
 * Keeps the underlying link ids so nothing is lost — the details panel and
 * drill-down can always get back to the individual links.
 */
function addAggregatedEdge(map, aId, bId, link) {
  if (aId === bId) return;
  const key = aggregateKey(aId, bId);
  let entry = map.get(key);
  
  const sourceIsA = aId < bId;
  const visualSource = sourceIsA ? aId : bId;
  const visualTarget = sourceIsA ? bId : aId;

  if (!entry) {
    entry = {
      id: `E-${key}`,
      source: visualSource,
      target: visualTarget,
      linkIds: [],
      count: 0,
      downCount: 0,
      bandwidthMbps: 0,
      flowForward: false,
      flowReverse: false,
    };
    map.set(key, entry);
  }
  
  if (sourceIsA) entry.flowForward = true;
  else entry.flowReverse = true;
  
  entry.linkIds.push(link.link_id);
  entry.count += 1;
  if (link.status === 'down') entry.downCount += 1;
  entry.bandwidthMbps += link.bandwidth_mbps || 0;
}

function finishEdges(map) {
  const result = [];
  for (const entry of map.values()) {
    const allDown = entry.downCount === entry.count;
    const someDown = entry.downCount / entry.count >= 0.25;
    const baseLabel = entry.count > 1
      ? `${entry.count} links${entry.downCount ? ` · ${entry.downCount} down` : ''}`
      : `${bwLabel(entry.bandwidthMbps)}${allDown ? ' · down' : ''}`;

    const size = entry.count > 1 ? Math.min(2, 1 + Math.log10(entry.count) * 0.5) : 0.8;
    const fill = allDown ? '#ef4444' : someDown ? '#f59e0b' : '#3f4a5c';

    const baseEdge = {
      size,
      fill,
      dashed: allDown,
      data: {
        kind: 'link',
        count: entry.count,
        downCount: entry.downCount,
        linkIds: entry.linkIds,
        bandwidthMbps: entry.bandwidthMbps,
      },
    };

    if (entry.flowForward) {
      result.push({
        ...baseEdge,
        id: `${entry.id}-F`,
        source: entry.source,
        target: entry.target,
        label: (entry.flowReverse ? '▶ ' : '') + baseLabel,
        arrowPlacement: 'end',
      });
    }

    if (entry.flowReverse) {
      result.push({
        ...baseEdge,
        id: `${entry.id}-R`,
        source: entry.target,
        target: entry.source,
        label: (entry.flowForward ? '◀ ' : '') + baseLabel,
        arrowPlacement: 'end',
      });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Global view: core -> distribution -> buildings
 * ------------------------------------------------------------------ */

export function buildGlobalGraph(data, mappingIndex) {
  const { buildings, buildingBySwitchId } = mappingIndex;

  const coreNodes = data.nodes.filter((n) => n.tier === 'core');
  const distNodes = data.nodes.filter((n) => n.tier === 'distribution');

  const sites = [...new Set([...coreNodes, ...distNodes].map((n) => n.location))].sort();
  const buildingsBySite = new Map(sites.map((s) => [s, []]));
  for (const b of buildings) {
    if (!buildingsBySite.has(b.site)) buildingsBySite.set(b.site, []);
    buildingsBySite.get(b.site).push(b);
  }

  /* ---- which distribution routers feed which building? --------------
   * Read from the real links, not from the mapping rules, so the drawn
   * hierarchy always matches the actual cabling. Each router is placed
   * directly above the first building it serves, which is what keeps the
   * global view readable instead of a mesh of crossing uplinks.
   * ------------------------------------------------------------------ */
  const routersByBuilding = new Map(buildings.map((b) => [b.id, []]));
  const routerOwner = new Map();

  for (const b of buildings) {
    for (const switchId of b.switchIds) {
      for (const link of data.linksByNode.get(switchId) || []) {
        const otherId = link.a === switchId ? link.b : link.a;
        const other = data.nodesById.get(otherId);
        if (!other || other.tier !== 'distribution') continue;
        if (routerOwner.has(otherId)) continue;
        routerOwner.set(otherId, b.id);
        routersByBuilding.get(b.id).push(otherId);
      }
    }
  }

  // Distribution routers with no switches under them still have to appear.
  const orphanRoutersBySite = new Map(sites.map((s) => [s, []]));
  for (const r of distNodes) {
    if (!routerOwner.has(r.id)) orphanRoutersBySite.get(r.location)?.push(r.id);
  }

  /* ---- positions -------------------------------------------------- */
  const positions = new Map();

  const columnsForSite = (site) => {
    const cols = (buildingsBySite.get(site) || []).map((b) => ({
      building: b,
      routers: routersByBuilding.get(b.id) || [],
    }));
    const orphans = orphanRoutersBySite.get(site) || [];
    if (orphans.length > 0) cols.push({ building: null, routers: orphans });
    return cols;
  };

  const siteColumns = new Map(sites.map((s) => [s, columnsForSite(s)]));
  const siteWidths = sites.map((s) => {
    const cols = siteColumns.get(s).length;
    return cols * LAYOUT.colWidth + (cols - 1) * LAYOUT.colGap;
  });

  const totalWidth =
    siteWidths.reduce((a, b) => a + b, 0) + LAYOUT.siteGap * Math.max(0, sites.length - 1);

  let cursor = -totalWidth / 2;
  const siteCenters = new Map();
  const siteBounds = new Map();
  sites.forEach((site, i) => {
    siteBounds.set(site, { left: cursor, width: siteWidths[i] });
    siteCenters.set(site, cursor + siteWidths[i] / 2);
    cursor += siteWidths[i] + LAYOUT.siteGap;
  });

  // Lay out each site: building columns along x, uplink routers stacked
  // directly above their building.
  for (const site of sites) {
    const { left } = siteBounds.get(site);
    const cols = siteColumns.get(site);

    cols.forEach((col, i) => {
      const cx = left + LAYOUT.colWidth / 2 + i * (LAYOUT.colWidth + LAYOUT.colGap);

      if (col.building) {
        positions.set(col.building.id, { x: cx, y: LAYOUT.buildingY, z: 0 });
      }

      col.routers.forEach((routerId, j) => {
        const row = Math.floor(j / LAYOUT.routersPerRow);
        const inRow = Math.min(LAYOUT.routersPerRow, col.routers.length - row * LAYOUT.routersPerRow);
        const k = j % LAYOUT.routersPerRow;
        const rowWidth = (inRow - 1) * LAYOUT.routerGap;
        positions.set(routerId, {
          x: cx - rowWidth / 2 + k * LAYOUT.routerGap,
          y: LAYOUT.distTopY - row * LAYOUT.distRowGap,
          z: 0,
        });
      });
    });
  }

  /* ---- core routers ------------------------------------------------
   * A core router that sends most of its uplinks into one site sits above
   * that site; the rest are true backbone routers and get their own band.
   * ------------------------------------------------------------------ */
  const coreSiteShare = new Map();
  for (const c of coreNodes) {
    const counts = new Map();
    for (const link of data.linksByNode.get(c.id) || []) {
      const otherId = link.a === c.id ? link.b : link.a;
      const other = data.nodesById.get(otherId);
      if (!other || other.tier !== 'distribution') continue;
      counts.set(other.location, (counts.get(other.location) || 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    let best = null;
    for (const [loc, n] of counts) {
      if (!best || n > best.n) best = { loc, n };
    }
    coreSiteShare.set(c.id, best && total > 0 && best.n / total > 0.5 ? best.loc : null);
  }

  const anchoredBySite = new Map(sites.map((s) => [s, []]));
  const backbone = [];
  for (const c of coreNodes) {
    const site = coreSiteShare.get(c.id);
    if (site && anchoredBySite.has(site)) anchoredBySite.get(site).push(c.id);
    else backbone.push(c.id);
  }

  for (const site of sites) {
    const ids = anchoredBySite.get(site);
    const center = siteCenters.get(site);
    ids.forEach((id, i) => {
      const width = (ids.length - 1) * LAYOUT.coreGap;
      positions.set(id, { x: center - width / 2 + i * LAYOUT.coreGap, y: LAYOUT.coreY, z: 0 });
    });
  }

  backbone.forEach((id, i) => {
    const span = totalWidth * 0.45;
    const step = backbone.length > 1 ? span / (backbone.length - 1) : 0;
    positions.set(id, { x: -span / 2 + i * step, y: LAYOUT.backboneY, z: 0 });
  });

  /* ---- nodes ------------------------------------------------------ */
  const nodes = [];

  for (const n of coreNodes) {
    nodes.push({
      id: n.id,
      label: n.name,
      subLabel: coreSiteShare.get(n.id) || 'Backbone',
      fill: severityColor(n.severity),
      size: NODE_SIZE.core,
      data: {
        kind: 'device',
        deviceType: n.type,
        tier: 'core',
        nodeId: n.id,
        name: n.name,
        stats: computeDeviceStats(n, data),
      },
    });
  }

  // Distribution routers deliberately carry no label: 140 of them at once
  // would bury the view in text. They are identified on hover, on selection
  // and through search instead.
  for (const n of distNodes) {
    nodes.push({
      id: n.id,
      fill: severityColor(n.severity),
      size: NODE_SIZE.distribution,
      data: {
        kind: 'device',
        deviceType: n.type,
        tier: 'distribution',
        nodeId: n.id,
        name: n.name,
        stats: computeDeviceStats(n, data),
      },
    });
  }

  const buildingStats = new Map();
  for (const b of buildings) {
    const stats = computeBuildingStats(b, data);
    buildingStats.set(b.id, stats);
    // Labels have to stay short: 30 of them share the width of the screen.
    // The full name is in the hover chip, the card grid and the details panel.
    const letter = (b.shortName || b.name).replace(/^Building\s*/i, '');
    nodes.push({
      id: b.id,
      label: b.siteCode ? `${b.siteCode} ${letter}` : b.name,
      subLabel: `${stats.total} sw`,
      fill: severityColor(buildingHealthLevel(stats)),
      size: NODE_SIZE.building,
      data: { kind: 'building', buildingId: b.id, name: b.name, stats },
    });
  }

  /* ---- edges (aggregated) ---------------------------------------- */
  const visualIdFor = (nodeId) => {
    const node = data.nodesById.get(nodeId);
    if (!node) return null;
    if (node.type === 'switch') return buildingBySwitchId.get(nodeId)?.id || null;
    return node.id;
  };

  const edgeMap = new Map();
  // Links between two switches in the SAME building collapse to a self-edge,
  // which there is no point drawing at this zoom level. They are not dropped:
  // they're counted on the building and drawn for real in the building view.
  const internalLinkIdsByBuilding = new Map();

  for (const link of data.resolvedLinks) {
    const a = visualIdFor(link.a);
    const b = visualIdFor(link.b);
    if (!a || !b) continue;
    if (a === b) {
      if (!internalLinkIdsByBuilding.has(a)) internalLinkIdsByBuilding.set(a, []);
      internalLinkIdsByBuilding.get(a).push(link.link_id);
      continue;
    }
    addAggregatedEdge(edgeMap, a, b, link);
  }

  for (const node of nodes) {
    if (node.data.kind !== 'building') continue;
    node.data.internalLinkIds = internalLinkIdsByBuilding.get(node.id) || [];
  }

  return {
    nodes,
    edges: finishEdges(edgeMap),
    positions,
    buildingStats,
    sites,
    siteCenters,
    internalLinkIdsByBuilding,
  };
}

/* ------------------------------------------------------------------ *
 * Building view: every individual switch in the building
 * ------------------------------------------------------------------ */

export function buildBuildingGraph(building, data, mappingIndex) {
  const memberSet = new Set(building.switchIds);
  const positions = new Map();
  const nodes = [];

  // Which distribution routers does this building actually uplink into?
  const uplinkRouterIds = new Set();
  const externalNeighbours = new Map(); // nodeId -> node (switches in other buildings)

  for (const id of building.switchIds) {
    for (const link of data.linksByNode.get(id) || []) {
      const otherId = link.a === id ? link.b : link.a;
      if (memberSet.has(otherId)) continue;
      const other = data.nodesById.get(otherId);
      if (!other) continue;
      if (other.type === 'router') uplinkRouterIds.add(otherId);
      else externalNeighbours.set(otherId, other);
    }
  }

  const routers = [...uplinkRouterIds].sort().map((id) => data.nodesById.get(id));
  const externals = [...externalNeighbours.values()];

  /* ---- positions -------------------------------------------------- */
  const SW_GAP_X = 74;
  const SW_GAP_Y = 66;
  const PER_ROW = Math.max(6, Math.min(14, Math.ceil(Math.sqrt(building.switchIds.length * 1.9))));

  // Uplink routers sit on a row above the switches.
  const routerGap = Math.max(110, (PER_ROW - 1) * SW_GAP_X / Math.max(1, routers.length - 1 || 1));
  const routerRowWidth = (routers.length - 1) * routerGap;
  routers.forEach((r, i) => {
    positions.set(r.id, { x: -routerRowWidth / 2 + i * routerGap, y: 210, z: 0 });
  });

  // Switches are laid out floor by floor, top floor first, so the vertical
  // bands read as the building's floors.
  let y = 40;
  const floorBands = [];
  for (const floor of [...building.floors].reverse()) {
    if (floor.switchIds.length === 0) continue;
    const rows = Math.ceil(floor.switchIds.length / PER_ROW);
    const bandTop = y;
    floor.switchIds.forEach((id, i) => {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const inRow = Math.min(PER_ROW, floor.switchIds.length - row * PER_ROW);
      const rowWidth = (inRow - 1) * SW_GAP_X;
      positions.set(id, { x: -rowWidth / 2 + col * SW_GAP_X, y: y - row * SW_GAP_Y, z: 0 });
    });
    floorBands.push({
      floor,
      top: bandTop,
      bottom: y - (rows - 1) * SW_GAP_Y,
      count: floor.switchIds.length,
    });
    y -= rows * SW_GAP_Y + 46; // gap between floors
  }

  // Switches in other buildings that this building genuinely links to.
  externals.forEach((n, i) => {
    positions.set(n.id, { x: (i - (externals.length - 1) / 2) * 130, y: y - 30, z: 0 });
  });

  /* ---- nodes ------------------------------------------------------ */
  for (const r of routers) {
    nodes.push({
      id: r.id,
      label: r.name,
      subLabel: r.tier === 'core' ? 'Core' : 'Distribution',
      fill: severityColor(r.severity),
      size: NODE_SIZE.core - 2,
      data: { kind: 'device', deviceType: r.type, tier: r.tier, nodeId: r.id, role: 'uplink' },
    });
  }

  for (const id of building.switchIds) {
    const n = data.nodesById.get(id);
    if (!n) continue;
    const floor = mappingIndex.floorBySwitchId.get(id);
    const stats = computeDeviceStats(n, data);
    nodes.push({
      id: n.id,
      label: n.name,
      subLabel: `${floor ? `${floor.name} · ` : ''}${n.status}`,
      fill: severityColor(n.severity),
      size: NODE_SIZE.switch + (stats.activeAlarmCount > 0 ? 2 : 0),
      data: {
        kind: 'device',
        deviceType: 'switch',
        tier: 'access',
        nodeId: n.id,
        floorId: floor?.id,
        stats,
      },
    });
  }

  for (const n of externals) {
    const owner = mappingIndex.buildingBySwitchId.get(n.id);
    nodes.push({
      id: n.id,
      label: n.name,
      subLabel: owner ? `in ${owner.name}` : 'external',
      fill: '#64748b',
      size: NODE_SIZE.external,
      data: { kind: 'device', deviceType: n.type, tier: n.tier, nodeId: n.id, external: true },
    });
  }

  /* ---- edges (real links, not aggregated) ------------------------- */
  const drawn = new Set(nodes.map((n) => n.id));
  const edgeMap = new Map();
  for (const id of building.switchIds) {
    for (const link of data.linksByNode.get(id) || []) {
      if (!drawn.has(link.a) || !drawn.has(link.b)) continue;
      addAggregatedEdge(edgeMap, link.a, link.b, link);
    }
  }

  return {
    nodes,
    edges: finishEdges(edgeMap),
    positions,
    floorBands,
    uplinkRouterIds: [...uplinkRouterIds],
    externalIds: externals.map((n) => n.id),
  };
}
