import React from 'react';

export default function TrashModal({ isOpen, onClose, deletedElements, onRestore }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 500, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Deleted Nodes</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {deletedElements.length === 0 ? (
            <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: 16, textAlign: 'center' }}>
              No nodes have been deleted in this session.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {deletedElements.map((item, idx) => (
                <div key={idx} style={{ 
                  background: '#1e293b', 
                  padding: 12, 
                  borderRadius: 6, 
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: 4 }}>
                      {item.node.name} <span style={{ color: '#64748b', fontSize: '0.85em', fontWeight: 'normal' }}>({item.node.id})</span>
                    </div>
                    <div style={{ fontSize: '0.85em', color: '#94a3b8' }}>
                      Deleted at {item.deletedAt}
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#64748b', marginTop: 4 }}>
                      Cascaded: {item.interfaces.length} interfaces, {item.links.length} links, {item.alarms.length} alarms
                    </div>
                  </div>
                  
                  <button 
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                    onClick={() => onRestore(idx)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
