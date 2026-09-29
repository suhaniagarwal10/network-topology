/**
 * Data-integrity test for the building grouping layer.
 *
 *   npm run validate
 *
 * The whole point of this file is to prove that adding buildings to the
 * *visualisation* never changes the *network*. It runs the real mapper and
 * the real transforms against the real dataset and fails loudly if a single
 * device, link or alarm goes missing.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyBuildingMapping } from '../src/utils/buildingMapper.js';
import { buildBuildingGraph, buildGlobalGraph, computeBuildingStats } from '../src/utils/topologyTransform.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(HERE, '../public/network-topology-dataset.json'), 'utf8'));
const mappingConfig = JSON.parse(readFileSync(resolve(HERE, '../src/data/buildingMapping.json'), 'utf8'));

let failures = 0;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ---------- rebuild the same derived structures the app builds ---------- */

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
let unresolved = 0;

for (const l of raw.links) {
  const a = ifaceToNode.get(l.source_interface_id);
  const b = ifaceToNode.get(l.target_interface_id);
  if (!a || !b || !nodesById.has(a) || !nodesById.has(b)) {
    unresolved += 1;
    continue;
  }
  const rl = { ...l, a, b };
  resolvedLinks.push(rl);
  if (!linksByNode.has(a)) linksByNode.set(a, []);
  if (!linksByNode.has(b)) linksByNode.set(b, []);
  linksByNode.get(a).push(rl);
  linksByNode.get(b).push(rl);

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

const data = {
  meta: raw.meta,
  nodes: raw.nodes,
  nodesById,
  interfaces: raw.interfaces,
  interfacesByNode,
  resolvedLinks,
  linksByNode,
  alarmsByNode,
  uplinkRoutersBySwitch,
};

/* ---------- 1. the dataset itself ---------- */

console.log('\nDataset');
const routers = raw.nodes.filter((n) => n.type === 'router');
const switches = raw.nodes.filter((n) => n.type === 'switch');
const actualDevices = routers.length + switches.length;

console.log(`  Actual network devices: ${actualDevices}`);
check('nodes.length === 1500', raw.nodes.length === 1500, `got ${raw.nodes.length}`);
check('routers + switches === 1500', actualDevices === 1500, `${routers.length} routers + ${switches.length} switches`);
check('every node is a router or a switch', actualDevices === raw.nodes.length);
check('all links resolve to nodes', unresolved === 0, `${unresolved} unresolved`);
check('interfaces are not nodes', raw.interfaces.every((i) => !nodesById.has(i.interface_id)));
check(
  'every alarm points at a real device',
  raw.alarms.every((a) => nodesById.has(a.nodeId))
);
check('every switch has a building field', switches.every((s) => typeof s.building === 'string' && s.building.length > 0));
check('every node has a groups array', raw.nodes.every((n) => Array.isArray(n.groups) && n.groups.every((g) => typeof g === 'string')));
check('multi-group membership is supported', raw.nodes.some((n) => Array.isArray(n.groups) && n.groups.length > 1));

/* ---------- 2. the mapping ---------- */

console.log('\nBuilding mapping');
const index = applyBuildingMapping(raw.nodes, mappingConfig, { uplinkRoutersBySwitch });

check('dataset node array was not mutated', raw.nodes.length === 1500, `${raw.nodes.length}`);
check(
  'no building leaked into the node dataset',
  !raw.nodes.some((n) => index.buildingsById.has(n.id))
);
check('every switch is mapped', index.stats.mappedCount === switches.length, `${index.stats.mappedCount}/${switches.length}`);
check('no switch mapped twice', new Set(index.buildings.flatMap((b) => b.switchIds)).size === switches.length);
check(
  'building switch totals sum to 1350',
  index.buildings.reduce((s, b) => s + b.switchIds.length, 0) === switches.length
);
check('no router was put into a building', !index.buildings.some((b) => b.switchIds.some((id) => nodesById.get(id)?.type !== 'switch')));
check(
  'every switch sits on exactly one floor',
  switches.every((s) => Boolean(index.floorBySwitchId.get(s.id)))
);
console.log(`  buildings: ${index.buildings.length}, switches/building: ${Math.min(
  ...index.buildings.map((b) => b.switchIds.length)
)}–${Math.max(...index.buildings.map((b) => b.switchIds.length))}`);

/* ---------- 3. the global graph ---------- */

console.log('\nGlobal graph');
const global = buildGlobalGraph(data, index);
const globalDeviceNodes = global.nodes.filter((n) => n.data.kind === 'device');
const globalBuildingNodes = global.nodes.filter((n) => n.data.kind === 'building');

check('no access switch drawn individually in the global view', !globalDeviceNodes.some((n) => n.data.tier === 'access'));
check('all 10 core routers drawn', globalDeviceNodes.filter((n) => n.data.tier === 'core').length === 10);
check(
  'all 140 distribution routers drawn',
  globalDeviceNodes.filter((n) => n.data.tier === 'distribution').length === 140
);
check('one graph node per building', globalBuildingNodes.length === index.buildings.length);
check('every global node has a position', global.nodes.every((n) => global.positions.has(n.id)));

const aggregatedLinkIds = new Set(global.edges.flatMap((e) => e.data.linkIds));
const internalLinkIds = new Set([...global.internalLinkIdsByBuilding.values()].flat());
const coveredLinkIds = new Set([...aggregatedLinkIds, ...internalLinkIds]);
check(
  'every real link is accounted for (aggregated edge or intra-building)',
  coveredLinkIds.size === resolvedLinks.length,
  `${aggregatedLinkIds.size} aggregated + ${internalLinkIds.size} intra-building = ${coveredLinkIds.size}/${resolvedLinks.length}`
);
check('aggregated and intra-building sets do not overlap', aggregatedLinkIds.size + internalLinkIds.size === coveredLinkIds.size);
console.log(`  ${global.nodes.length} nodes, ${global.edges.length} edges (from ${resolvedLinks.length} links)`);

/* ---------- 4. drill-down loses nothing ---------- */

console.log('\nBuilding drill-down');
let drilledSwitches = 0;
let statTotals = 0;
let worstBuilding = null;

for (const building of index.buildings) {
  const g = buildBuildingGraph(building, data, index);
  const drawnMembers = g.nodes.filter((n) => building.switchIds.includes(n.id));
  if (drawnMembers.length !== building.switchIds.length) {
    worstBuilding = `${building.name}: drew ${drawnMembers.length} of ${building.switchIds.length}`;
  }
  drilledSwitches += drawnMembers.length;

  const stats = computeBuildingStats(building, data);
  statTotals += stats.total;

  // Health numbers must add up to the real switch count.
  if (stats.connected + stats.connecting + stats.down !== stats.total) {
    worstBuilding = `${building.name}: status counts don't sum`;
  }
  if (Object.values(stats.severity).reduce((a, b) => a + b, 0) !== stats.total) {
    worstBuilding = `${building.name}: severity counts don't sum`;
  }
  if (!g.nodes.every((n) => g.positions.has(n.id))) {
    worstBuilding = `${building.name}: missing node position`;
  }
}

check('every mapped switch appears in its building view', drilledSwitches === switches.length, `${drilledSwitches}/${switches.length}`);
check('building stats total to 1350 switches', statTotals === switches.length, `${statTotals}`);
check('per-building health numbers are internally consistent', worstBuilding === null, worstBuilding || '');

/* ---------- 5. searchability ---------- */

console.log('\nSearch reachability');
check(
  'every switch resolves to a building (so search can navigate to it)',
  switches.every((s) => Boolean(index.buildingBySwitchId.get(s.id)))
);
check('every router is present in the global graph', routers.every((r) => global.positions.has(r.id)));
check('every building is present in the global graph', index.buildings.every((b) => global.positions.has(b.id)));

/* ---------- result ---------- */

console.log('');
if (failures > 0) {
  console.error(`FAILED — ${failures} check(s) did not pass.`);
  process.exit(1);
}
console.log('All checks passed. 1,500 devices intact, nothing lost to grouping.\n');
