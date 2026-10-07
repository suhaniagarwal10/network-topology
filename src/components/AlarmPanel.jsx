import { useState, useMemo } from 'react';
import { timeAgo } from '../utils/graph';
import { getNodeLabel } from '../utils/topologyTransform';

export default function AlarmPanel({ alarms, data, settings, onClose, onAcknowledge, onResolve, onFocusNode, now }) {
  const [filterSev, setFilterSev] = useState('all');
  
  const sorted = useMemo(() => {
    return alarms
      .filter(a => filterSev === 'all' || a.severity === filterSev)
      .sort((a, b) => a.raisedAt < b.raisedAt ? 1 : -1);
  }, [alarms, filterSev]);

  return (
    <div className="alarm-panel">
      <div className="alarm-panel-header">
        <h3>Alarm Management</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      
      <div className="alarm-panel-filters">
        <label>Severity: </label>
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)}>
          <option value="all">All Active</option>
          <option value="critical">Critical</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      <div className="alarm-list">
        {sorted.length === 0 ? (
          <div className="empty-hint" style={{ padding: 16 }}>No alarms match the current filter.</div>
        ) : (
          sorted.map(a => {
            const nodeObj = data?.nodesById?.get(a.nodeId);
            const nodeDisplay = nodeObj ? getNodeLabel(nodeObj, settings) : a.nodeId;
            return (
              <div key={a.alarmId || a.id} className={`alarm-row sev-${a.severity} ${a.status === 'resolved' ? 'resolved' : ''}`}>
                <div className="alarm-main" onClick={() => onFocusNode(a.nodeId)}>
                  <div className="alarm-row-header">
                    <span className={`sev-badge ${a.severity}`}>{a.severity}</span>
                    <span className="node-id">{nodeDisplay}</span>
                    <span className="time">{timeAgo(a.raisedAt, now)}</span>
                  </div>
                  <div className="desc">{a.description}</div>
                </div>
              
                <div className="alarm-actions">
                  {a.status === 'active' && (
                    <>
                      <button onClick={() => onAcknowledge(a.alarmId || a.id)}>Ack</button>
                      <button onClick={() => onResolve(a.alarmId || a.id)}>Resolve</button>
                    </>
                  )}
                  {a.status === 'acknowledged' && (
                    <button onClick={() => onResolve(a.alarmId || a.id)}>Resolve</button>
                  )}
                  {a.status === 'resolved' && <span className="resolved-text">Resolved</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
