import { SEV_COLOR, statusColor, timeAgo } from '../utils/graph';

export default function DetailsPanel({ node, alarms, linkCount, onMonitor, onHighlightNeighbors, now }) {
  if (!node) {
    return (
      <aside className="details">
        <h2>Node details</h2>
        <div className="empty-hint">
          Click any node to view its status, alarms and connections. Right-click a node
          for quick actions. Drag to pan, scroll to zoom, or use search above.
        </div>
      </aside>
    );
  }

  const color = SEV_COLOR[node.severity];
  const sColor = statusColor(node.status);
  const sortedAlarms = [...alarms].sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1));

  return (
    <aside className="details">
      <h2>{node.name}</h2>
      <div className="kv">
        <Row k="ID" v={node.id} />
        <Row k="Type" v={<span style={{ textTransform: 'capitalize' }}>{node.type}</span>} />
        <Row k="Status" v={<Dot color={sColor} text={node.status} />} />
        <Row k="Severity" v={<Dot color={color} text={node.severity} />} />
        <Row k="IP address" v={node.ipAddress} />
        <Row k="Location" v={<span style={{ fontFamily: 'inherit', fontWeight: 400 }}>{node.location}</span>} />
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
            <div className="id">{a.id}</div>
          </div>
        ))
      )}

      <div className="btnrow">
        <button onClick={() => onMonitor(node)}>Monitor node</button>
        <button onClick={() => onHighlightNeighbors(node)}>Highlight neighbors</button>
      </div>
      <div className="empty-hint" style={{ marginTop: 10 }}>{linkCount} connected link{linkCount === 1 ? '' : 's'}</div>
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
