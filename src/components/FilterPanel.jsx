import { useState } from 'react';

export default function FilterPanel({ filters, onChange }) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button className="filter-toggle" onClick={() => setExpanded(true)}>
        <span className="glyph">🔍</span> Filters
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

      <div className="filter-group">
        <h4>Type</h4>
        <label><input type="checkbox" checked={filters.router} onChange={() => toggle('router')} /> Routers</label>
        <label><input type="checkbox" checked={filters.switch} onChange={() => toggle('switch')} /> Switches / Buildings</label>
      </div>

      <div className="filter-group">
        <h4>Status</h4>
        <label><input type="checkbox" checked={filters.up} onChange={() => toggle('up')} /> UP</label>
        <label><input type="checkbox" checked={filters.down} onChange={() => toggle('down')} /> DOWN</label>
        <label><input type="checkbox" checked={filters.warningStatus} onChange={() => toggle('warningStatus')} /> WARNING</label>
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
