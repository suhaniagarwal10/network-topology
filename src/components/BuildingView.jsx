import { buildingHealthLevel, severityColor } from '../utils/graph.js';

/**
 * Building cards. Every number shown here is aggregated from the actual
 * switches the mapping assigned to the building — see computeBuildingStats.
 * Nothing on this card is synthetic.
 */
export function BuildingCard({ building, stats, active, onOpen, onSelect }) {
  const accent = severityColor(buildingHealthLevel(stats));
  return (
    <div
      className={`bcard${active ? ' active' : ''}`}
      style={{ '--bcolor': accent }}
      onClick={() => onSelect?.(building)}
      onDoubleClick={() => onOpen?.(building)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.(building);
      }}
    >
      <div className="bcard-head">
        <span className="bcard-name">
          <span className="glyph">🏢</span>
          {building.name}
        </span>
        <span className="bcard-site">{building.site}</span>
      </div>

      <div className="bcard-grid">
        <Metric label="Switches" value={stats.total} />
        <Metric label="Connected" value={stats.connected} tone="ok" />
        <Metric label="Down" value={stats.down} tone={stats.down ? 'bad' : undefined} />
        <Metric
          label="Warning"
          value={stats.severity.warning + stats.severity.minor}
          tone={stats.severity.warning + stats.severity.minor ? 'warn' : undefined}
        />
        <Metric label="Critical" value={stats.severity.critical} tone={stats.severity.critical ? 'bad' : undefined} />
        <Metric
          label="Alarms"
          value={stats.activeAlarmCount}
          tone={stats.activeAlarmCount ? 'warn' : undefined}
        />
      </div>

      <button
        type="button"
        className="bcard-open"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.(building);
        }}
      >
        View switches →
      </button>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className={`metric${tone ? ` ${tone}` : ''}`}>
      <span className="m-value">{value}</span>
      <span className="m-label">{label}</span>
    </div>
  );
}

/**
 * The card grid shown as an alternative to the graph in the global view —
 * the "at a glance" health board for the whole estate.
 */
export default function BuildingView({ buildings, statsById, selectedId, onOpen, onSelect }) {
  const bySite = new Map();
  for (const b of buildings) {
    if (!bySite.has(b.site)) bySite.set(b.site, []);
    bySite.get(b.site).push(b);
  }

  return (
    <div className="bgrid-scroll">
      {[...bySite.entries()].map(([site, list]) => {
        const siteSwitches = list.reduce((sum, b) => sum + (statsById.get(b.id)?.total || 0), 0);
        const siteAlarms = list.reduce((sum, b) => sum + (statsById.get(b.id)?.activeAlarmCount || 0), 0);
        return (
          <section className="bgroup" key={site}>
            <h3 className="bgroup-title">
              {site}
              <span className="bgroup-meta">
                {list.length} buildings · {siteSwitches} switches
                {siteAlarms ? ` · ${siteAlarms} active alarms` : ''}
              </span>
            </h3>
            <div className="bgrid">
              {list.map((b) => (
                <BuildingCard
                  key={b.id}
                  building={b}
                  stats={statsById.get(b.id)}
                  active={selectedId === b.id}
                  onOpen={onOpen}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
