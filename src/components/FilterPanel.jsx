import { useState } from 'react';

export default function FilterPanel({ filters, onChange, availableGroups = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button className="filter-toggle" onClick={() => setExpanded(true)}>
        <span className="glyph">🔍</span> Filters
        {filters.selectedGroup && filters.selectedGroup !== 'ALL' && (
          <span style={{ marginLeft: 6, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 8, fontSize: '0.65rem' }}>
            Group
          </span>
        )}
      </button>
    );
  }

  const toggle = (key) => onChange({ ...filters, [key]: !filters[key] });

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>Filters</h3>
        <button onClick={() => setExpanded(false)}>×</button>
      </div>

      {availableGroups && availableGroups.length > 0 && (
        <div className="filter-group">
          <h4>Custom Group</h4>
          <select
            value={filters.selectedGroup || 'ALL'}
            onChange={(e) => onChange({ ...filters, selectedGroup: e.target.value })}
            style={{
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              padding: '5px 8px',
              borderRadius: 4,
              fontSize: '0.8rem',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Nodes (No group filter)</option>
            {availableGroups.map((g) => (
              <option key={g} value={g}>🏷️ {g}</option>
            ))}
          </select>
          {filters.selectedGroup && filters.selectedGroup !== 'ALL' && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, selectedGroup: 'ALL' })}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a855f7',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '2px 0',
              }}
            >
              Clear group filter
            </button>
          )}
        </div>
      )}

      <div className="filter-group">
        <h4>Type</h4>
        <label><input type="checkbox" checked={filters.router} onChange={() => toggle('router')} /> Routers</label>
        <label><input type="checkbox" checked={filters.switch} onChange={() => toggle('switch')} /> Switches / Buildings</label>
      </div>

      <div className="filter-group">
        <h4>Status</h4>
        <label><input type="checkbox" checked={filters.up} onChange={() => toggle('up')} /> UP</label>
        <label><input type="checkbox" checked={filters.down} onChange={() => toggle('down')} /> DOWN</label>
      </div>

      <div className="filter-group">
        <h4>Severity</h4>
        <label><input type="checkbox" checked={filters.critical} onChange={() => toggle('critical')} /> Critical</label>
        <label><input type="checkbox" checked={filters.major} onChange={() => toggle('major')} /> Major</label>
        <label><input type="checkbox" checked={filters.minor} onChange={() => toggle('minor')} /> Minor</label>
        <label><input type="checkbox" checked={filters.warning} onChange={() => toggle('warning')} /> Warning</label>
        <label><input type="checkbox" checked={filters.normal} onChange={() => toggle('normal')} /> Normal</label>
      </div>
    </div>
  );
}
