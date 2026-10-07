import { getNodeLabel, getInterfaceLabel } from '../utils/topologyTransform';

export default function LinkModal({ links, nodeName, data, settings, onClose }) {
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
                {links.map((l, i) => {
                  const srcId = l.a || l.source;
                  const tgtId = l.b || l.target;
                  const srcNode = data?.nodesById?.get(srcId);
                  const tgtNode = data?.nodesById?.get(tgtId);
                  const srcLabel = srcNode ? getNodeLabel(srcNode, settings) : srcId;
                  const tgtLabel = tgtNode ? getNodeLabel(tgtNode, settings) : tgtId;
                  const srcIf = l.source_interface_id ? ` (${getInterfaceLabel(l.source_interface_id, settings, data)})` : '';
                  const tgtIf = l.target_interface_id ? ` (${getInterfaceLabel(l.target_interface_id, settings, data)})` : '';
                  return (
                    <tr key={l.link_id || i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: 8 }}>{l.link_id}</td>
                      <td style={{ padding: 8 }}>{srcLabel}{srcIf}</td>
                      <td style={{ padding: 8 }}>{tgtLabel}{tgtIf}</td>
                      <td style={{ padding: 8 }}>{l.bandwidth_mbps ? `${l.bandwidth_mbps} Mbps` : 'N/A'}</td>
                      <td style={{ padding: 8, color: l.status === 'down' ? '#ef4444' : '#22c55e' }}>{l.status?.toUpperCase() || 'UP'}</td>
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
