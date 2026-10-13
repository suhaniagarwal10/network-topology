import { SEV_COLOR } from '../utils/graph.js';
import { iconDataUri } from '../utils/nodeIcons.js';

// Shape legend uses a neutral grey so it reads as "shape", not "health".
const SHAPE_COLOR = '#64748b';

/**
 * Legend for the graph. Severity colours match the dataset's own vocabulary
 * ("minor" shares the warning gold so the legend stays four buckets wide).
 */
export default function Legend({ view }) {
  return (
    <div className="legend">
      <div className="legend-title">Severity</div>
      <LegendItem color={SEV_COLOR.normal} label="Normal" />
      <LegendItem color={SEV_COLOR.warning} label="Warning / minor" />
      <LegendItem color={SEV_COLOR.major} label="Major" />
      <LegendItem color={SEV_COLOR.critical} label="Critical" />
      <div className="legend-sep" />
      <div className="legend-item">
        <span className="dashline" />
        Link down / degraded
      </div>
      <div className="legend-sep" />
      <ShapeItem kind="router" label={view === 'global' ? 'Router (core is larger)' : 'Uplink router'} />
      {view === 'global' ? (
        <ShapeItem kind="building" label="Building (ring = health)" />
      ) : (
        <ShapeItem kind="switch" label="Switch" />
      )}
      {view === 'global' && (
        <div className="legend-item legend-hint">Double-click a building to open it</div>
      )}
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

function ShapeItem({ kind, label }) {
  return (
    <div className="legend-item">
      <img className="legend-icon" src={iconDataUri(kind, SHAPE_COLOR)} alt="" />
      {label}
    </div>
  );
}
