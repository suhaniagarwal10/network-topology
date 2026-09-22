/**
 * Regenerates src/data/buildingMapping.json from the topology dataset.
 *
 *   node scripts/generateBuildingMapping.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * Buildings are a *visualization* concept, not network devices. This script
 * derives a sensible default mapping from the real data so the shipped
 * mapping file is accurate, then writes it out as a plain, hand-editable
 * JSON rule file. Nothing in the app depends on this script at runtime —
 * `src/data/buildingMapping.json` is the contract, and you can edit it by
 * hand (or swap it for a CMDB export) without touching any code.
 *
 * HOW THE DEFAULT MAPPING IS DERIVED
 * ----------------------------------
 * In a real campus network a building's wiring closets uplink to the
 * distribution routers that serve that building. The dataset already encodes
 * this: every access switch links to one or more distribution routers in the
 * *same* location. So we:
 *
 *   1. group distribution routers by location (site),
 *   2. cut each site's routers into N contiguous groups,
 *   3. a building = "the switches that uplink into router group G".
 *
 * That keeps the global graph a clean tree (each distribution router feeds
 * exactly one building) instead of a hairball of crossing lines.
 *
 * IMPORTANT: this script never edits the dataset. All 1,500 devices stay
 * exactly where they are; this only produces a grouping overlay.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASET = resolve(HERE, '../public/network-topology-dataset.json');
const OUT = resolve(HERE, '../src/data/buildingMapping.json');

/** How many buildings to carve each site into. Tune freely. */
const BUILDINGS_PER_SITE = 6;
/** How many floors each building is modelled as having. */
const FLOORS_PER_BUILDING = 4;

const SITE_CODES = {
  'Data Center 1': 'DC1',
  'Data Center 2': 'DC2',
  'Data Center 3': 'DC3',
  'Data Center 4': 'DC4',
  'NOC Central': 'NOC',
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function siteCode(location) {
  if (SITE_CODES[location]) return SITE_CODES[location];
  return location
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const raw = JSON.parse(readFileSync(DATASET, 'utf8'));

const nodesById = new Map(raw.nodes.map((n) => [n.id, n]));
const ifaceToNode = new Map(raw.interfaces.map((i) => [i.interface_id, i.node_id]));

// switch id -> sorted list of the distribution routers it uplinks into
const uplinks = new Map();
for (const link of raw.links) {
  const a = ifaceToNode.get(link.source_interface_id);
  const b = ifaceToNode.get(link.target_interface_id);
  if (!a || !b) continue;
  const na = nodesById.get(a);
  const nb = nodesById.get(b);
  if (!na || !nb) continue;
  for (const [sw, other] of [
    [na, nb],
    [nb, na],
  ]) {
    if (sw.type !== 'switch' || other.tier !== 'distribution') continue;
    if (!uplinks.has(sw.id)) uplinks.set(sw.id, new Set());
    uplinks.get(sw.id).add(other.id);
  }
}

const sites = [...new Set(raw.nodes.map((n) => n.location))].sort();
const buildings = [];
let buildingSeq = 0;

for (const site of sites) {
  const code = siteCode(site);
  const siteRouters = raw.nodes
    .filter((n) => n.tier === 'distribution' && n.location === site)
    .map((n) => n.id)
    .sort();

  const groupSize = Math.ceil(siteRouters.length / BUILDINGS_PER_SITE);
  const groups = [];
  for (let i = 0; i < siteRouters.length; i += groupSize) {
    groups.push(siteRouters.slice(i, i + groupSize));
  }

  groups.forEach((routerGroup, idx) => {
    buildingSeq += 1;
    const routerSet = new Set(routerGroup);
    const members = raw.nodes
      .filter(
        (n) =>
          n.type === 'switch' &&
          n.location === site &&
          [...(uplinks.get(n.id) || [])].some((r) => routerSet.has(r))
      )
      .map((n) => n.id)
      .sort();

    buildings.push({
      id: `B-${String(buildingSeq).padStart(3, '0')}`,
      name: `${code} Building ${LETTERS[idx] || idx + 1}`,
      shortName: `Building ${LETTERS[idx] || idx + 1}`,
      site,
      siteCode: code,
      floorCount: FLOORS_PER_BUILDING,
      _candidateSwitches: members,
      match: {
        locations: [site],
        uplinkRouters: routerGroup,
      },
    });
  });
}

// A switch with redundant uplinks can be a candidate for more than one
// building. The mapper is first-match-wins, so simulate that here purely to
// record an accurate documentation count on each rule.
const claimed = new Set();
for (const b of buildings) {
  const mine = b._candidateSwitches.filter((id) => !claimed.has(id));
  mine.forEach((id) => claimed.add(id));
  b.derivedSwitchCount = mine.length;
  delete b._candidateSwitches;
}

const mapping = {
  version: 1,
  generatedAt: new Date().toISOString(),
  description:
    'Visual grouping layer only. Buildings are NOT network devices and are never added to the node dataset. Every rule below selects switches that already exist in public/network-topology-dataset.json.',
  options: {
    // Switches that no rule claims still have to live somewhere — they are
    // collected into an automatically created building per location so that
    // no device can ever disappear from the UI.
    autoAssignUnmatched: true,
    unmatchedBuildingNameTemplate: '{site} · Unassigned',
    defaultFloorCount: FLOORS_PER_BUILDING,
  },
  /**
   * Matching rules, evaluated top to bottom — first building that accepts a
   * switch owns it. Supported matchers (all optional, OR'd together):
   *
   *   switchIds      ["S-0001", "S-0002"]            explicit membership
   *   switchRanges   [{ "from": "S-0001", "to": "S-0030" }]  inclusive id range
   *   uplinkRouters  ["R-0011"]   switches uplinking into any of these routers
   *   locations      ["Data Center 1"]  constrains the matchers above;
   *                  with "matchAllInLocation": true it also matches on its own
   *
   * Optional per-building keys:
   *   floorCount  number   switches are chunked across this many floors
   *   floors      [{ "id", "name", "switchIds": [...] }]  explicit floor plan
   */
  buildings,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(mapping, null, 2)}\n`);

const total = buildings.reduce((sum, b) => sum + b.derivedSwitchCount, 0);
const switchCount = raw.nodes.filter((n) => n.type === 'switch').length;
console.log(`Wrote ${OUT}`);
console.log(`  buildings:        ${buildings.length}`);
console.log(`  switches claimed: ${total} / ${switchCount}`);
console.log(
  `  per building:     min ${Math.min(...buildings.map((b) => b.derivedSwitchCount))}, max ${Math.max(
    ...buildings.map((b) => b.derivedSwitchCount)
  )}`
);
