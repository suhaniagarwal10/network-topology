/**
 * Small pieces of UI chrome around the graph: header + stat strip, zoom
 * controls, the node context menu and the toast.
 *
 * Legend moved to its own component (Legend.jsx); it is re-exported here so
 * existing imports keep working.
 */
export { default as Legend } from './Legend';

export function ZoomControls({ onZoomIn, onZoomOut, onFit }) {
  return (
    <div className="zoomctl">
      <button onClick={onZoomIn} title="Zoom in">
        +
      </button>
      <button onClick={onZoomOut} title="Zoom out">
        &minus;
      </button>
      <button onClick={onFit} title="Fit to screen">
        &#9723;
      </button>
    </div>
  );
}

export function Header({ stats, view, mode, onModeChange, onSimulateAlarm, onAddNode, onToggleAlarms, onReset, onOpenTrash, deletedCount, children }) {
  return (
    <header>
      <h1>
        Network Topology
        <span className="h1-sub">{view === 'building' ? 'Building view' : 'Enterprise overview'}</span>
      </h1>

      <div className="stats">
        <div className="stat">
          Devices
          <b>{stats.deviceCount.toLocaleString()}</b>
        </div>
        <div className="stat">
          Routers
          <b>{stats.routerCount.toLocaleString()}</b>
        </div>
        <div className="stat">
          Switches
          <b>{stats.switchCount.toLocaleString()}</b>
        </div>
        <div className="stat">
          Buildings
          <b>{stats.buildingCount.toLocaleString()}</b>
        </div>
        <div className="stat">
          Links
          <b>{stats.linkCount.toLocaleString()}</b>
        </div>
        <div className="stat">
          Down
          <b>{stats.downCount.toLocaleString()}</b>
        </div>
        <div className="stat crit" onClick={onToggleAlarms} style={{ cursor: 'pointer' }} title="Manage Alarms">
          Active alarms
          <b>{stats.activeAlarmCount.toLocaleString()}</b>
        </div>
        <button onClick={onAddNode} style={{ marginLeft: 16, padding: '4px 8px', borderRadius: 4, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Add Node
        </button>
        {deletedCount > 0 && (
          <button onClick={onOpenTrash} style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            Trash ({deletedCount})
          </button>
        )}
        <button onClick={onSimulateAlarm} style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Simulate Alarm
        </button>
        {onReset && (
          <button onClick={onReset} style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>
            Reset App
          </button>
        )}
      </div>

      {view === 'global' && (
        <div className="modeswitch" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'graph'}
            className={mode === 'graph' ? 'on' : ''}
            onClick={() => onModeChange('graph')}
          >
            Topology
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'cards'}
            className={mode === 'cards' ? 'on' : ''}
            onClick={() => onModeChange('cards')}
          >
            Buildings
          </button>
        </div>
      )}

      {children}
    </header>
  );
}

export function ContextMenu({ node, items, onAction, onClose }) {
  if (!node) return null;
  return (
    <div className="ctxmenu" onMouseLeave={onClose}>
      <div className="ctxmenu-head">{node.label || node.id}</div>
      {items.map((item, i) =>
        item.key === 'sep' ? (
          // eslint-disable-next-line react/no-array-index-key
          <div className="sep" key={`sep-${i}`} />
        ) : (
          <div
            key={item.key}
            onClick={() => {
              onAction(item.key, node);
              onClose();
            }}
          >
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
