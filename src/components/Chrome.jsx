import { useState } from 'react';
import { SEV_COLOR } from '../utils/graph';

export function Legend() {
  return (
    <div className="legend">
      <LegendItem color={SEV_COLOR.normal} label="Normal" />
      <LegendItem color={SEV_COLOR.warning} label="Warning" />
      <LegendItem color={SEV_COLOR.major} label="Major" />
      <LegendItem color={SEV_COLOR.critical} label="Critical" />
      <div className="legend-item"><span className="dashline" />Link down</div>
      <div className="legend-item">&#9670; Router &nbsp; &#9633; Switch</div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="legend-item">
      <span className="dot" style={{ background: color }} />
      {label}
    </div>
  );
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit }) {
  return (
    <div className="zoomctl">
      <button onClick={onZoomIn} title="Zoom in">+</button>
      <button onClick={onZoomOut} title="Zoom out">&minus;</button>
      <button onClick={onFit} title="Fit to screen">&#9723;</button>
    </div>
  );
}

export function Header({ stats, nodes, onPickNode }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q.length >= 2
    ? nodes.filter((n) =>
        n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.ipAddress.includes(q)
      ).slice(0, 12)
    : [];

  return (
    <header>
      <h1>Network Topology</h1>
      <div className="stats">
        <div className="stat">Nodes<b>{stats.nodeCount.toLocaleString()}</b></div>
        <div className="stat">Links<b>{stats.linkCount.toLocaleString()}</b></div>
        <div className="stat">Down<b>{stats.downCount}</b></div>
        <div className="stat crit">Active alarms<b>{stats.activeAlarmCount}</b></div>
      </div>
      <div className="searchbox">
        <input
          placeholder="Find node by name, ID or IP..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <div className="search-results">
            {matches.map((n) => (
              <div
                key={n.id}
                onClick={() => { onPickNode(n); setQuery(n.name); }}
              >
                {n.name} &middot; {n.ipAddress} &middot;{' '}
                <span style={{ color: SEV_COLOR[n.severity] }}>{n.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

export function ContextMenu({ node, x, y, onClose, onAction }) {
  if (!node) return null;
  const items = [
    { key: 'details', label: 'View node details' },
    { key: 'monitor', label: 'Monitor node' },
    { key: 'neighbors', label: 'Highlight neighbors' },
    { key: 'sep', label: null },
    { key: 'copyip', label: 'Copy IP address' },
  ];
  return (
    <div className="ctxmenu" style={{ left: x, top: y }} onMouseLeave={onClose}>
      {items.map((item) =>
        item.key === 'sep' ? (
          <div className="sep" key="sep" />
        ) : (
          <div key={item.key} onClick={() => { onAction(item.key, node); onClose(); }}>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
