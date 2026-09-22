import { useState } from 'react';
import { timeAgo } from '../utils/graph';

export default function LinkModal({ links, nodeName, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '90%' }}>
        <h2>Links for {nodeName}</h2>
        <div className="alarm-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {links.length === 0 ? (
            <div className="empty-hint" style={{ padding: 16 }}>No links connected.</div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: 8 }}>Link ID</th>
                  <th style={{ padding: 8 }}>Source</th>
                  <th style={{ padding: 8 }}>Target</th>
                  <th style={{ padding: 8 }}>Bandwidth</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l, i) => (
                  <tr key={l.link_id || i} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: 8 }}>{l.link_id}</td>
                    <td style={{ padding: 8 }}>{l.a || l.source}</td>
                    <td style={{ padding: 8 }}>{l.b || l.target}</td>
                    <td style={{ padding: 8 }}>{l.bandwidth_mbps ? `${l.bandwidth_mbps} Mbps` : 'N/A'}</td>
                    <td style={{ padding: 8, color: l.status === 'down' ? '#ef4444' : '#22c55e' }}>{l.status?.toUpperCase() || 'UP'}</td>
                  </tr>
                ))}
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
