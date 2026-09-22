import { SEV_COLOR, severityColor, statusColor, tierLabel, timeAgo } from '../utils/graph.js';

/**
 * Right-hand inspector. Shows either:
 *   - a device (router or switch) with its status, alarms and connections, or
 *   - a building, with health aggregated from the switches it contains.
 *
 * All the device behaviour from the original panel is preserved.
 */
export default function DetailsPanel({
  node,
  building,
  buildingStats,
  alarms,
  linkCount,
  interfaceCount,
  owningBuilding,
  floor,
  onMonitor,
  onHighlightNeighbors,
  onOpenBuilding,
  now,
}) {
  if (building && !node) {
    return (
      <BuildingDetails
        building={building}
        stats={buildingStats}
        alarms={alarms}
        onOpenBuilding={onOpenBuilding}
        now={now}
      />
    );
  }

  if (!node) {
    return (
      <aside className="details">
        <h2>Details</h2>
        <div className="empty-hint">
          Click any node to view its status, alarms and connections. Double-click a building to
          open it and see its individual switches. Right-click for quick actions. Drag to pan,
          scroll to zoom, or use the search above.
        </div>
      </aside>
    );
  }

  const color = severityColor(node.severity);
  const sColor = statusColor(node.status);
  const sortedAlarms = [...(alarms || [])].sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1));

  return (
    <aside className="details">
      <h2>{node.name}</h2>
      <div className="details-sub">{tierLabel(node)}</div>

      <div className="kv">
        <Row k="ID" v={node.id} />
        <Row k="Type" v={<span style={{ textTransform: 'capitalize' }}>{node.type}</span>} />
        <Row k="Status" v={<Dot color={sColor} text={node.status} />} />
        <Row k="Severity" v={<Dot color={color} text={node.severity} />} />
        <Row k="IP address" v={node.ipAddress} />
        <Row k="Location" v={<span className="plain">{node.location}</span>} />
        {owningBuilding && (
          <Row
            k="Building"
            v={
              <button type="button" className="linkish" onClick={() => onOpenBuilding?.(owningBuilding.id)}>
                {owningBuilding.name}
              </button>
            }
          />
        )}
        {floor && <Row k="Floor" v={<span className="plain">{floor.name}</span>} />}
        <Row k="Interfaces" v={interfaceCount ?? 0} />
        <Row k="Links" v={linkCount ?? 0} />
      </div>

      <div className="section-title">Alarms ({sortedAlarms.length})</div>
      {sortedAlarms.length === 0 ? (
        <div className="empty-hint">No alarms on this node.</div>
      ) : (
        sortedAlarms.map((a) => (
          <div className={`alarm ${a.severity}`} key={a.id}>
            <div className="top">
              <span className={`sev ${a.severity}`}>{a.severity}</span>
              <span className="time">{timeAgo(a.raisedAt, now)}</span>
            </div>
            <div className="desc">{a.description}</div>
            <div className="id">
              {a.id} · {a.status}
            </div>
          </div>
        ))
      )}

      <div className="btnrow">
        <button onClick={() => onMonitor(node)}>Monitor node</button>
        <button onClick={() => onHighlightNeighbors(node)}>Highlight neighbors</button>
      </div>
      <div className="empty-hint" style={{ marginTop: 10 }}>
        {linkCount} connected link{linkCount === 1 ? '' : 's'}
      </div>
    </aside>
  );
}

function BuildingDetails({ building, stats, alarms, onOpenBuilding, now }) {
  if (!stats) return null;
  const recent = [...(alarms || [])]
    .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
    .slice(0, 6);

  return (
    <aside className="details">
      <h2>
        <span className="glyph">🏢</span> {building.name}
      </h2>
      <div className="details-sub">{building.site}</div>

      <div className="kv">
        <Row k="Switches" v={stats.total} />
        <Row k="Connected" v={<Dot color="#22c55e" text={String(stats.connected)} />} />
        <Row k="Connecting" v={<Dot color="#eab308" text={String(stats.connecting)} />} />
        <Row k="Down" v={<Dot color="#ef4444" text={String(stats.down)} />} />
        <Row k="Worst severity" v={<Dot color={severityColor(stats.worstSeverity)} text={stats.worstSeverity} />} />
        <Row k="Links" v={`${stats.linkCount}${stats.downLinkCount ? ` (${stats.downLinkCount} down)` : ''}`} />
        <Row k="Active alarms" v={stats.activeAlarmCount} />
      </div>

      <div className="section-title">Severity breakdown</div>
      <div className="sevbars">
        {['critical', 'major', 'warning', 'minor', 'normal'].map((sev) => {
          const count = stats.severity[sev] || 0;
          const pct = stats.total ? (count / stats.total) * 100 : 0;
          return (
            <div className="sevbar" key={sev}>
              <span className="sevbar-label">{sev}</span>
              <span className="sevbar-track">
                <span className="sevbar-fill" style={{ width: `${pct}%`, background: SEV_COLOR[sev] }} />
              </span>
              <span className="sevbar-count">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="section-title">Floors</div>
      <div className="floorlist">
        {building.floors
          .filter((f) => f.switchIds.length > 0)
          .map((f) => (
            <div className="floorrow" key={f.id}>
              <span>{f.name}</span>
              <span className="floorcount">{f.switchIds.length} switches</span>
            </div>
          ))}
      </div>

      <div className="section-title">Recent alarms ({(alarms || []).length})</div>
      {recent.length === 0 ? (
        <div className="empty-hint">No alarms in this building.</div>
      ) : (
        recent.map((a) => (
          <div className={`alarm ${a.severity}`} key={a.id}>
            <div className="top">
              <span className={`sev ${a.severity}`}>{a.severity}</span>
              <span className="time">{timeAgo(a.raisedAt, now)}</span>
            </div>
            <div className="desc">{a.description}</div>
            <div className="id">
              {a.nodeId} · {a.id}
            </div>
          </div>
        ))
      )}

      <div className="btnrow">
        <button onClick={() => onOpenBuilding(building.id)}>View switches →</button>
      </div>
    </aside>
  );
}

function Row({ k, v }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Dot({ color, text }) {
  return (
    <span className="v-status" style={{ color }}>
      <span className="dot" style={{ background: color }} />
      {text}
    </span>
  );
}
