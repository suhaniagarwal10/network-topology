import { useState } from 'react';

export default function QuickAssignGroupModal({
  node,
  allGroups = [],
  onSave,
  onOpenFullManager,
  onClose,
}) {
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(node?.groups || []));
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState('');

  if (!node) return null;

  const toggleGroup = (group) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleAddNewGroup = (e) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setSelectedGroups(prev => new Set([...prev, trimmed]));
    setNewGroupName('');
    setError('');
  };

  const handleSave = () => {
    onSave(node.id, Array.from(selectedGroups));
    onClose();
  };

  // Combine existing groups + any newly added ones
  const availableGroups = Array.from(new Set([...allGroups, ...Array.from(selectedGroups)])).sort();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content quick-group-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Assign Groups</h3>
            <div style={{ color: 'var(--sub)', fontSize: '0.8rem', marginTop: 4 }}>
              <strong>{node.name}</strong> ({node.id}) · {node.building || 'Router/Unassigned'}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Member of Groups:
          </label>
          {availableGroups.length === 0 ? (
            <div className="empty-hint" style={{ padding: '8px 0' }}>No groups created yet. Create one below!</div>
          ) : (
            <div className="quick-group-list" style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {availableGroups.map(g => {
                const isMember = selectedGroups.has(g);
                return (
                  <label
                    key={g}
                    className={`quick-group-item ${isMember ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      background: isMember ? 'rgba(139, 92, 246, 0.15)' : 'var(--panel2)',
                      border: isMember ? '1px solid #8b5cf6' : '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isMember}
                      onChange={() => toggleGroup(g)}
                    />
                    <span style={{ fontWeight: isMember ? 600 : 400, color: isMember ? '#c084fc' : 'var(--text)' }}>
                      🏷️ {g}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Add new group quick input */}
        <form onSubmit={handleAddNewGroup} style={{ marginBottom: 18 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>Or create new group:</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="text"
              placeholder="New group name..."
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--panel2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: '0.85rem'
              }}
            />
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              style={{
                background: '#8b5cf6',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              + Add
            </button>
          </div>
          {error && <div style={{ color: 'var(--critical)', fontSize: '0.75rem', marginTop: 4 }}>{error}</div>}
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {onOpenFullManager && (
            <button
              type="button"
              className="linkish"
              style={{ fontSize: '0.8rem', color: '#a855f7' }}
              onClick={() => {
                onClose();
                onOpenFullManager();
              }}
            >
              Open Full Group Manager →
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" className="btn-cancel" onClick={onClose} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
              Save Groups
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
