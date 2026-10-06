/**
 * Building mapping layer.
 *
 * Buildings are a VISUAL GROUPING ONLY. Nothing in here ever adds to,
 * removes from, or mutates the network node dataset — it reads the nodes and
 * produces a separate index describing which switch is shown inside which
 * building. The raw `nodes` array always keeps all 1,500 routers + switches.
 *
 *     1,500 actual nodes
 *             |
 *       building mapping   <- this file
 *             |
 *       visual grouping
 */

/** Numeric part of an id like "S-0042" -> 42. Non-matching ids -> NaN. */
function idOrdinal(id) {
  const m = /(\d+)\s*$/.exec(id);
  return m ? Number(m[1]) : Number.NaN;
}

/** Inclusive id-range test that compares the numeric suffix, e.g. S-0001..S-0030. */
function inRange(id, range) {
  if (!range || !range.from || !range.to) return false;
  const prefix = (s) => s.replace(/(\d+)\s*$/, '');
  if (prefix(id) !== prefix(range.from)) return false;
  const v = idOrdinal(id);
  const lo = idOrdinal(range.from);
  const hi = idOrdinal(range.to);
  if (Number.isNaN(v) || Number.isNaN(lo) || Number.isNaN(hi)) return false;
  return v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
}

/**
 * Does `rule.match` accept this switch?
 *
 * Matchers are OR'd. `locations` doubles as a constraint on `uplinkRouters`
 * so a rule can say "routers R-0011.. but only their Data Center 1 switches".
 */
function ruleMatches(rule, node, uplinkRouters) {
  const match = rule.match || {};
  const {
    switchIds = [],
    switchRanges = [],
    uplinkRouters: wantedRouters = [],
    locations = [],
    matchAllInLocation = false,
  } = match;

  if (switchIds.includes(node.id)) return true;
  if (switchRanges.some((r) => inRange(node.id, r))) return true;

  if (wantedRouters.length > 0) {
    const hit = uplinkRouters.some((r) => wantedRouters.includes(r));
    if (hit && (locations.length === 0 || locations.includes(node.location))) return true;
  }

  if (matchAllInLocation && locations.includes(node.location)) return true;

  return false;
}

/**
 * Split a building's switches across floors.
 * Explicit `floors` win; otherwise chunk deterministically by id order.
 */
function buildFloors(rule, switchIds, defaultFloorCount) {
  if (Array.isArray(rule.floors) && rule.floors.length > 0) {
    const claimed = new Set();
    const floors = rule.floors.map((f, i) => {
      const ids = (f.switchIds || []).filter((id) => switchIds.includes(id));
      ids.forEach((id) => claimed.add(id));
      return { id: f.id || `${rule.id}-F${i + 1}`, name: f.name || `Floor ${i + 1}`, switchIds: ids };
    });
    const leftovers = switchIds.filter((id) => !claimed.has(id));
    if (leftovers.length > 0) {
      floors.push({ id: `${rule.id}-F${floors.length + 1}`, name: 'Unassigned floor', switchIds: leftovers });
    }
    return floors;
  }

  const count = Math.max(1, rule.floorCount || defaultFloorCount || 1);
  const perFloor = Math.ceil(switchIds.length / count) || 1;
  const floors = [];
  for (let i = 0; i < count; i += 1) {
    const ids = switchIds.slice(i * perFloor, (i + 1) * perFloor);
    if (ids.length === 0 && i > 0) continue;
    floors.push({ id: `${rule.id}-F${i + 1}`, name: `Floor ${i + 1}`, switchIds: ids });
  }
  return floors;
}

/**
 * Apply a mapping config to the dataset.
 *
 * @param {Array}  nodes    the untouched `nodes` array from the dataset
 * @param {Object} mapping  contents of src/data/buildingMapping.json
 * @param {Object} ctx      { uplinkRoutersBySwitch: Map<string, string[]> }
 * @returns {{
 *   buildings: Array,                 // [{ id, name, site, switchIds, floors, ... }]
 *   buildingsById: Map,
 *   buildingBySwitchId: Map,          // switch id -> building
 *   floorBySwitchId: Map,             // switch id -> floor object
 *   stats: { switchCount, mappedCount, unmatchedCount, buildingCount }
 * }}
 */
export function applyBuildingMapping(nodes, mapping, ctx = {}) {
  const uplinkRoutersBySwitch = ctx.uplinkRoutersBySwitch || new Map();
  const switches = nodes.filter((n) => n.type === 'switch');
  const rules = mapping?.buildings || [];
  const options = mapping?.options || {};

  const claimed = new Map(); // switch id -> rule id
  const membersByRule = new Map(rules.map((r) => [r.id, []]));

  // First match wins, so a redundantly-uplinked switch still belongs to
  // exactly one building and can never be counted twice or dropped.
  for (const sw of switches) {
    const uplinks = uplinkRoutersBySwitch.get(sw.id) || [];
    for (const rule of rules) {
      if (ruleMatches(rule, sw, uplinks)) {
        membersByRule.get(rule.id).push(sw.id);
        claimed.set(sw.id, rule.id);
        break;
      }
    }
  }

  let buildings = rules.map((rule) => {
    const switchIds = membersByRule.get(rule.id) || [];
    return {
      id: rule.id,
      name: rule.name || rule.id,
      shortName: rule.shortName || rule.name || rule.id,
      site: rule.site || (rule.match?.locations || [])[0] || 'Unknown',
      siteCode: rule.siteCode || '',
      switchIds,
      floors: buildFloors(rule, switchIds, options.defaultFloorCount),
      generated: false,
    };
  });

  // Safety net: a switch that no rule claimed still has to be reachable in
  // the UI. First check if its `building` property matches an existing building by name/id;
  // otherwise it gets an auto-created building rather than vanishing.
  const unmatched = switches.filter((s) => !claimed.has(s.id));
  if (unmatched.length > 0 && options.autoAssignUnmatched !== false) {
    const byGroup = new Map();
    const modifiedRules = new Set();

    for (const sw of unmatched) {
      const wantedBldg = (sw.building || '').trim();
      const existingBldg = wantedBldg
        ? buildings.find(
            (b) =>
              b.name.toLowerCase() === wantedBldg.toLowerCase() ||
              b.id.toLowerCase() === wantedBldg.toLowerCase()
          )
        : null;

      if (existingBldg) {
        existingBldg.switchIds.push(sw.id);
        claimed.set(sw.id, existingBldg.id);
        modifiedRules.add(existingBldg.id);
      } else {
        const groupKey = wantedBldg || sw.location || 'Default Site';
        if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
        byGroup.get(groupKey).push(sw);
      }
    }

    for (const bId of modifiedRules) {
      const bldg = buildings.find((b) => b.id === bId);
      const rule = rules.find((r) => r.id === bId) || { id: bId, floorCount: options.defaultFloorCount };
      if (bldg) {
        bldg.floors = buildFloors(rule, bldg.switchIds, options.defaultFloorCount);
      }
    }

    let seq = 0;
    for (const [groupName, swList] of byGroup) {
      seq += 1;
      const switchIds = swList.map((s) => s.id).sort();
      const site = swList[0]?.location || 'Site 1';
      const rule = { id: `B-AUTO-${String(seq).padStart(3, '0')}`, floorCount: options.defaultFloorCount || 3 };
      buildings.push({
        id: rule.id,
        name: groupName,
        shortName: groupName.replace(/^Building\s*/i, ''),
        site,
        siteCode: '',
        switchIds,
        floors: buildFloors(rule, switchIds, options.defaultFloorCount || 3),
        generated: true,
      });
      switchIds.forEach((id) => claimed.set(id, rule.id));
    }
  }

  // Filter out any rule-defined buildings that have 0 switches (e.g. for custom datasets)
  // while preserving all active buildings for default dataset
  buildings = buildings.filter((b) => b.switchIds.length > 0);

  const buildingsById = new Map(buildings.map((b) => [b.id, b]));
  const buildingBySwitchId = new Map();
  const floorBySwitchId = new Map();
  for (const b of buildings) {
    for (const id of b.switchIds) buildingBySwitchId.set(id, b);
    for (const f of b.floors) {
      for (const id of f.switchIds) floorBySwitchId.set(id, f);
    }
  }

  return {
    buildings,
    buildingsById,
    buildingBySwitchId,
    floorBySwitchId,
    stats: {
      switchCount: switches.length,
      mappedCount: buildingBySwitchId.size,
      unmatchedCount: switches.length - buildingBySwitchId.size,
      buildingCount: buildings.length,
    },
  };
}

export const __test__ = { inRange, ruleMatches, buildFloors };
