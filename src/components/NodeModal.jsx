import { useState } from 'react';

export default function NodeModal({ node, data, availableGroups = [], onSave, onClose }) {
  const [formData, setFormData] = useState(() => ({
    id: node?.id || '',
    name: node?.name || node?.label || '',
    type: node?.type || 'switch',
    tier: node?.tier || 'access',
    ipAddress: node?.ipAddress || node?.ip_address || '',
    location: node?.location || '',
    building: node?.building || (node?.type === 'switch' ? 'DC1 Building A' : ''),
    status: node?.status || 'connected',
    groups: Array.isArray(node?.groups) ? [...node.groups] : [],
  }));

  const [groupInput, setGroupInput] = useState('');

  const addGroup = (e) => {
    e.preventDefault();
    const trimmed = groupInput.trim();
    if (!trimmed) return;
    if (!formData.groups.includes(trimmed)) {
      setFormData(prev => ({ ...prev, groups: [...prev.groups, trimmed] }));
    }
    setGroupInput('');
  };

  const removeGroup = (groupToRemove) => {
    setFormData(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g !== groupToRemove),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      building: formData.type === 'switch' ? (formData.building.trim() || null) : null,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>{node ? 'Edit Node' : 'Add Node'}</h2>
        <form onSubmit={handleSubmit}>
          {!node && (
            <div className="form-group">
              <label htmlFor="modal-node-id">Node ID</label>
              <input
                id="modal-node-id"
                required
                value={formData.id}
                onChange={e => setFormData({ ...formData, id: e.target.value })}
                placeholder="e.g. S-1351"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="modal-node-name">Name</label>
            <input
              id="modal-node-name"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Switch-1351"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-type">Type</label>
              <select
                id="modal-node-type"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="switch">Switch</option>
                <option value="router">Router</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="modal-node-tier">Tier</label>
              <select
                id="modal-node-tier"
                value={formData.tier}
                onChange={e => setFormData({ ...formData, tier: e.target.value })}
              >
                <option value="access">Access</option>
                <option value="distribution">Distribution</option>
                <option value="core">Core</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-ip">IP Address</label>
              <input
                id="modal-node-ip"
                value={formData.ipAddress}
                onChange={e => setFormData({ ...formData, ipAddress: e.target.value })}
                placeholder="e.g. 10.0.12.5"
              />
            </div>
            <div className="form-group">
              <label htmlFor="modal-node-status">Status</label>
              <select
                id="modal-node-status"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="connected">Connected (UP)</option>
                <option value="down">Down</option>
                <option value="connecting">Connecting</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-location">Location (Site)</label>
              <input
                id="modal-node-location"
                list="locations-list"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Data Center 1"
              />
              <datalist id="locations-list">
                {Array.from(new Set((data?.nodes || []).map(n => n.location).filter(Boolean))).map(loc => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="modal-node-building">Building</label>
              <input
                id="modal-node-building"
                list="buildings-list"
                value={formData.building || ''}
                onChange={e => setFormData({ ...formData, building: e.target.value })}
                placeholder="e.g. DC1 Building A"
                disabled={formData.type === 'router'}
              />
              <datalist id="buildings-list">
                {Array.from(new Set((data?.nodes || []).map(n => n.building).filter(Boolean))).map(bldg => (
                  <option key={bldg} value={bldg} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Groups management */}
          <div className="form-group">
            <label>Groups (Dynamic membership):</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {formData.groups.length === 0 ? (
                <span className="empty-hint" style={{ fontSize: '0.8rem', padding: '4px 0' }}>Not in any groups yet.</span>
              ) : (
                formData.groups.map(g => (
                  <span key={g} className="group-badge">
                    🏷️ {g}
                    <button
                      type="button"
                      className="group-badge-remove"
                      onClick={() => removeGroup(g)}
                      title="Remove group"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                list="available-groups-list"
                placeholder="Add to group (type or select)..."
                value={groupInput}
                onChange={e => setGroupInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGroup(e);
                  }
                }}
              />
              <datalist id="available-groups-list">
                {availableGroups.map(g => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={addGroup}
                disabled={!groupInput.trim()}
                style={{
                  background: '#8b5cf6',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                }}
              >
                + Add
              </button>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" onClick={onClose} className="btn-cancel">Cancel</button>
            <button type="submit" className="btn-save">{node ? 'Save Changes' : 'Add Node'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
