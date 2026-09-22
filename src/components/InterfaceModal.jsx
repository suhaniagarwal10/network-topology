import { useState } from 'react';

export default function InterfaceModal({ interfaces, nodeName, nodeSeverity, nodeStatus, onClose }) {
  const isNodeDown = nodeSeverity === 'critical' || nodeSeverity === 'major' || nodeStatus === 'down';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '90%' }}>
        <h2>Interfaces for {nodeName}</h2>
        <div className="alarm-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {interfaces.length === 0 ? (
            <div className="empty-hint" style={{ padding: 16 }}>No interfaces available.</div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: 8 }}>Interface ID</th>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {interfaces.map((i, idx) => {
                  const rawStatus = i.status?.toLowerCase() || 'up';
                  const displayStatus = isNodeDown ? 'down' : rawStatus;
                  return (
                    <tr key={i.interface_id || idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: 8 }}>{i.interface_id}</td>
                      <td style={{ padding: 8 }}>{i.name}</td>
                      <td style={{ padding: 8, color: displayStatus.includes('down') ? '#ef4444' : '#22c55e' }}>{displayStatus.toUpperCase()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
