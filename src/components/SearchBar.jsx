import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_GLYPH, severityColor, tierLabel } from '../utils/graph.js';
import { getNodeLabel } from '../utils/topologyTransform.js';

/**
 * Search across every routable thing in the topology:
 * routers, switches (all 1,350 of them), buildings, IP addresses and sites.
 *
 * Results are typed so the user can tell a building from a device at a
 * glance, and picking a result hands App.jsx enough context to navigate
 * (including which building a switch lives in) without ever duplicating a
 * device into a second node.
 */

const MAX_RESULTS = 14;

function buildIndex(data, mappingIndex, settings) {
  if (!data || !mappingIndex) return [];
  const entries = [];

  for (const b of mappingIndex.buildings) {
    entries.push({
      kind: 'building',
      id: b.id,
      buildingId: b.id,
      title: b.name,
      subtitle: `${b.switchIds.length} switches · ${b.site}`,
      haystack: `${b.id} ${b.name} ${b.shortName} ${b.site} ${b.siteCode}`.toLowerCase(),
      color: null,
    });
  }

  // Index custom groups
  const groupMap = new Map();
  for (const n of data.nodes) {
    if (Array.isArray(n.groups)) {
      for (const g of n.groups) {
        if (!g) continue;
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g).push(n);
      }
    }
  }

  for (const [gName, members] of groupMap.entries()) {
    const buildingsCount = new Set(members.map((m) => m.building).filter(Boolean)).size;
    entries.push({
      kind: 'group',
      id: `group-${gName}`,
      groupName: gName,
      switchIds: members.map((m) => m.id),
      title: `Group: ${gName}`,
      subtitle: `${members.length} switch${members.length === 1 ? '' : 'es'} across ${buildingsCount} building${buildingsCount === 1 ? '' : 's'}`,
      haystack: `group ${gName} ${members.map((m) => m.name).join(' ')} ${members.map((m) => m.id).join(' ')}`.toLowerCase(),
      color: '#a855f7',
    });
  }

  for (const n of data.nodes) {
    const building = n.type === 'switch' ? (mappingIndex.buildingBySwitchId.get(n.id) || (n.building ? { name: n.building } : null)) : null;
    const floor = n.type === 'switch' ? mappingIndex.floorBySwitchId.get(n.id) : null;
    const subtitleParts = [];
    if (building) subtitleParts.push(building.name);
    if (floor) subtitleParts.push(floor.name);
    if (!building) subtitleParts.push(tierLabel(n));
    subtitleParts.push(n.ipAddress);
    if (n.groups && n.groups.length > 0) {
      subtitleParts.push(`Groups: ${n.groups.join(', ')}`);
    }
    const primaryLabel = getNodeLabel(n, settings);
    const secondaryLabel = primaryLabel === n.id ? n.name : n.id;

    entries.push({
      kind: n.type === 'switch' ? 'switch' : 'router',
      id: n.id,
      nodeId: n.id,
      buildingId: building?.id || null,
      title: secondaryLabel && secondaryLabel !== primaryLabel ? `${primaryLabel} (${secondaryLabel})` : primaryLabel,
      subtitle: subtitleParts.join(' · '),
      status: n.status,
      haystack: `${n.id} ${n.name} ${n.ipAddress} ${n.location} ${n.building || ''} ${(n.groups || []).join(' ')} ${tierLabel(n)} ${
        building?.name || ''
      } ${floor?.name || ''}`.toLowerCase(),
      color: severityColor(n.severity),
    });
  }

  // Standalone unlinked devices
  const standaloneNodes = [
    { id: 'STANDALONE-GW-01', name: 'STANDALONE-GW-01', ipAddress: '10.255.0.1', type: 'router', status: 'up', severity: 'normal', location: 'Site A', desc: 'Perimeter Security Gateway' },
    { id: 'STANDALONE-DR-02', name: 'STANDALONE-DR-02', ipAddress: '10.255.0.2', type: 'router', status: 'up', severity: 'warning', location: 'Site B', desc: 'Disaster Recovery Node' },
    { id: 'STANDALONE-LAB-03', name: 'STANDALONE-LAB-03', ipAddress: '10.255.0.3', type: 'switch', status: 'up', severity: 'normal', location: 'Site C', desc: 'Testbed Appliance' },
  ];

  for (const sn of standaloneNodes) {
    const primaryLabel = getNodeLabel(sn, settings);
    const secondaryLabel = primaryLabel === sn.id ? sn.name : sn.id;
    entries.push({
      kind: sn.type === 'switch' ? 'switch' : 'router',
      id: sn.id,
      nodeId: sn.id,
      buildingId: null,
      title: secondaryLabel && secondaryLabel !== primaryLabel ? `${primaryLabel} (${secondaryLabel})` : primaryLabel,
      subtitle: `Standalone · ${sn.desc} · ${sn.location}`,
      status: sn.status,
      haystack: `${sn.id} ${sn.name} ${sn.ipAddress} ${sn.desc} standalone isolated unlinked air-gapped ${sn.location}`.toLowerCase(),
      color: severityColor(sn.severity),
    });
  }

  return entries;
}

function score(entry, q) {
  const id = entry.id.toLowerCase();
  if (id === q) return 0;
  if (id.startsWith(q)) return 1;
  if (entry.title.toLowerCase().startsWith(q)) return 2;
  if (entry.kind === 'building') return 3;
  return 4;
}

export default function SearchBar({ data, mappingIndex, onPick, placeholder, settings }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const index = useMemo(() => buildIndex(data, mappingIndex, settings), [data, mappingIndex, settings]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    for (const entry of index) {
      if (entry.haystack.includes(q)) hits.push(entry);
      if (hits.length > 400) break; // plenty to rank, keeps typing snappy
    }
    return hits.sort((a, b) => score(a, q) - score(b, q)).slice(0, MAX_RESULTS);
  }, [index, query]);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(entry) {
    setQuery('');
    setOpen(false);
    onPick(entry);
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        placeholder={placeholder || 'Search routers, switches, buildings, IPs…'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) pick(results[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.trim().length >= 2 && (
        <div className="search-results">
          {results.length === 0 && <div className="search-empty">No matches for “{query}”</div>}
          {results.map((r) => (
            <button type="button" className="search-row" key={`${r.kind}-${r.id}`} onClick={() => pick(r)}>
              <span className="glyph">{KIND_GLYPH[r.kind]}</span>
              <span className="text">
                <span className="title">{r.title}</span>
                <span className="sub">{r.subtitle}</span>
              </span>
              {r.color && <span className="dot" style={{ background: r.color }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
