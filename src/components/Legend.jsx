import { SEV_COLOR } from '../utils/graph.js';

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
      {view === 'global' ? (
        <div className="legend-item legend-hint">
          🌐 Router &nbsp; 🏢 Building &nbsp;— double-click a building to open it
        </div>
      ) : (
        <div className="legend-item legend-hint">🌐 Uplink router &nbsp; 🔀 Switch</div>
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
