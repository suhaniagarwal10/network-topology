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
  link,
  buildingStats,
  alarms,
  linkCount,
  interfaceCount,
  owningBuilding,
  floor,
  onMonitor,
  onHighlightNeighbors,
  onOpenBuilding,
  onEditNode,
  onDeleteNode,
  onViewLinks,
  onViewInterfaces,
  onAddLink,
  onEditLinkBundle,
  now,
  onAddToGroup,
  onRemoveFromGroup,
  onHighlightGroup,
  onOpenGroup,
  groupName,
  groupStats,
  onEditGroup,
  onSelectNode,
  onGoGlobal,
  data,
}) {
  if (groupName && !node && !link && !building) {
    return (
      <GroupDetails
        groupName={groupName}
        stats={groupStats}
        onEditGroup={onEditGroup}
        onSelectNode={onSelectNode}
        onGoGlobal={onGoGlobal}
      />
    );
  }

  if (building && !node && !link) {
    return (
      <BuildingDetails
        building={building}
        stats={buildingStats}
        alarms={alarms}
        onOpenBuilding={onOpenBuilding}
        onHighlightGroup={onHighlightGroup}
        onOpenGroup={onOpenGroup}
        data={data}
        now={now}
      />
    );
  }

  if (link && !node && !building) {
    return (
      <aside className="details">
        <h2>Link Bundle</h2>
        <div className="details-sub">{link.source} ↔ {link.target}</div>
        
        <div className="kv">
          <Row k="Total links" v={link.data.count} />
          <Row k="Links down" v={<Dot color={link.data.downCount > 0 ? '#ef4444' : '#22c55e'} text={String(link.data.downCount)} />} />
          <Row k="Bandwidth" v={link.data.bandwidthMbps ? `${link.data.bandwidthMbps} Mbps` : 'Unknown'} />
          <Row k="Status" v={<Dot color={link.fill} text={link.data.downCount === link.data.count ? 'DOWN' : link.data.downCount > 0 ? 'DEGRADED' : 'UP'} />} />
        </div>

        {onEditLinkBundle && (
          <div className="btnrow" style={{ marginTop: 16 }}>
            <button onClick={() => onEditLinkBundle(link)}>Edit Link Bundle</button>
          </div>
        )}
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="details">
        <h2>Details</h2>
        <div className="empty-hint">
          Click any node to view its status, active alarms, physical links, and interfaces. Double-click a building to
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
        <Row
          k="Building"
          v={
            node.building ? (
              owningBuilding ? (
                <button type="button" className="linkish" onClick={() => onOpenBuilding?.(owningBuilding.id)}>
                  {node.building}
                </button>
              ) : (
                <span className="plain">{node.building}</span>
              )
            ) : owningBuilding ? (
              <button type="button" className="linkish" onClick={() => onOpenBuilding?.(owningBuilding.id)}>
                {owningBuilding.name}
              </button>
            ) : (
              <span className="plain" style={{ color: 'var(--sub)' }}>N/A (Router)</span>
            )
          }
        />
        {floor && <Row k="Floor" v={<span className="plain">{floor.name}</span>} />}
        <Row
          k="Groups"
          v={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 150 }}>
              {(!node.groups || node.groups.length === 0) ? (
                <span className="plain" style={{ color: 'var(--sub)' }}>None</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                  {node.groups.map(g => (
                    <span
                      key={g}
                      className="group-badge"
                      title={`Click to view group "${g}" only on screen`}
                      onClick={() => onOpenGroup ? onOpenGroup(g) : onHighlightGroup?.(g)}
                    >
                      <span className="group-badge-icon">🏷️</span>
                      <span className="group-badge-text">{g}</span>
                      {onRemoveFromGroup && (
                        <button
                          type="button"
                          className="group-badge-remove"
                          title={`Remove from ${g}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFromGroup(node.id, g);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {onAddToGroup && (
                <button
                  type="button"
                  onClick={() => onAddToGroup(node)}
                  className="btn-add-group-link"
                >
                  + Assign Groups
                </button>
              )}
            </div>
          }
        />
        <Row
          k="Interfaces"
          v={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{interfaceCount ?? 0}</span>
              {onViewInterfaces && interfaceCount > 0 && (
                <button
                  type="button"
                  onClick={() => onViewInterfaces(node.id)}
                  style={{ background: '#334155', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  View
                </button>
              )}
            </div>
          }
        />
        <Row
          k="Links"
          v={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{linkCount ?? 0}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {onViewLinks && linkCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onViewLinks(node.id)}
                    style={{ background: '#334155', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    View
                  </button>
                )}
                {onAddLink && (
                  <button
                    type="button"
                    onClick={() => onAddLink(node)}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          }
        />
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
        {onEditNode && <button onClick={() => onEditNode(node)}>Edit Node</button>}
        {onDeleteNode && <button onClick={() => onDeleteNode(node)} style={{ color: '#ef4444', borderColor: '#7f1d1d' }}>Delete Node</button>}
      </div>
      <div className="empty-hint" style={{ marginTop: 10 }}>
        {linkCount} connected link{linkCount === 1 ? '' : 's'}
      </div>
    </aside>
  );
}

function BuildingDetails({ building, stats, alarms, onOpenBuilding, onHighlightGroup, data, now }) {
  if (!stats) return null;
  const recent = [...(alarms || [])]
    .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
    .slice(0, 6);

  const groupsInBuilding = [];
  if (data?.nodesById && building?.switchIds) {
    const counts = new Map();
    for (const id of building.switchIds) {
      const sw = data.nodesById.get(id);
      if (sw && Array.isArray(sw.groups)) {
        for (const g of sw.groups) {
          if (g) counts.set(g, (counts.get(g) || 0) + 1);
        }
      }
    }
    for (const [name, count] of counts.entries()) {
      groupsInBuilding.push({ name, count });
    }
    groupsInBuilding.sort((a, b) => b.count - a.count);
  }

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

      {groupsInBuilding.length > 0 && (
        <>
          <div className="section-title">Groups in this building ({groupsInBuilding.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {groupsInBuilding.map((g) => (
              <span
                key={g.name}
                className="group-badge"
                title={`Click to view group "${g.name}" only on screen`}
                onClick={() => onOpenGroup ? onOpenGroup(g.name) : onHighlightGroup?.(g.name)}
              >
                <span className="group-badge-icon">🏷️</span>
                <span className="group-badge-text">{g.name} ({g.count})</span>
              </span>
            ))}
          </div>
        </>
      )}

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

function GroupDetails({ groupName, stats, onEditGroup, onSelectNode, onGoGlobal }) {
  if (!stats) return null;

  return (
    <aside className="details">
      <h2>
        <span className="glyph">📁</span> Group: {groupName}
      </h2>
      <div className="details-sub">
        Custom switch group · {stats.total} switches across {stats.buildings.length} building{stats.buildings.length === 1 ? '' : 's'}
      </div>

      <div className="kv">
        <Row k="Total switches" v={stats.total} />
        <Row k="Connected" v={<Dot color="#22c55e" text={String(stats.connected)} />} />
        <Row k="Connecting" v={<Dot color="#eab308" text={String(stats.connecting)} />} />
        <Row k="Down" v={<Dot color="#ef4444" text={String(stats.down)} />} />
        <Row k="Worst severity" v={<Dot color={severityColor(stats.worstSeverity)} text={stats.worstSeverity} />} />
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

      <div className="section-title">Buildings in this group ({stats.buildings.length})</div>
      <div className="floorlist">
        {stats.buildings.map((b) => (
          <div className="floorrow" key={b.name} style={{ flexDirection: 'column', gap: 6, padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <strong style={{ fontSize: '12px', color: '#c084fc' }}>🏢 {b.name}</strong>
              <span className="floorcount">{b.count} switches</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {b.switches.map((sw) => (
                <button
                  key={sw.id}
                  type="button"
                  onClick={() => onSelectNode?.(sw.id)}
                  style={{
                    background: '#1a2231',
                    border: '1px solid var(--border)',
                    color: '#e2e8f0',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title={`${sw.name} (${sw.ipAddress}) · ${sw.status}`}
                >
                  <span className="dot" style={{ background: statusColor(sw.status), width: 6, height: 6 }} />
                  {sw.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="btnrow" style={{ marginTop: 16 }}>
        {onEditGroup && (
          <button
            onClick={() => onEditGroup(groupName)}
            style={{ background: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 600 }}
          >
            ✏️ Edit Group
          </button>
        )}
        {onGoGlobal && (
          <button onClick={onGoGlobal}>
            ← Back to Network
          </button>
        )}
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
