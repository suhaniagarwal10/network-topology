import { useState, useMemo, useCallback } from 'react';

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
  const [groupInputError, setGroupInputError] = useState('');
  const [touched, setTouched] = useState({});

  const locationSuggestions = useMemo(() => {
    return Array.from(new Set((data?.nodes || []).map(n => n.location).filter(Boolean)));
  }, [data?.nodes]);

  const buildingSuggestions = useMemo(() => {
    return Array.from(new Set((data?.nodes || []).map(n => n.building).filter(Boolean)));
  }, [data?.nodes]);

  const validateField = useCallback((field, value, currentFormData = formData) => {
    switch (field) {
      case 'id': {
        if (node) return ''; // ID is not editable when editing an existing node
        const v = (value || '').trim();
        if (!v) return 'Node ID is required.';
        if (!/^[a-zA-Z0-9_-]+$/.test(v)) return 'ID may only contain letters, numbers, hyphens, and underscores.';
        if (v.length < 2 || v.length > 30) return 'ID must be between 2 and 30 characters.';
        if (data?.nodesById?.has(v)) return `A node with ID "${v}" already exists.`;
        return '';
      }
      case 'name': {
        const v = (value || '').trim();
        if (!v) return 'Node name is required.';
        if (v.length < 2 || v.length > 50) return 'Name must be between 2 and 50 characters.';
        return '';
      }
      case 'ipAddress': {
        const v = (value || '').trim();
        if (!v) return 'IP Address is required.';
        const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
        if (!ipv4Regex.test(v)) return 'Enter a valid IPv4 address (e.g. 10.0.12.5).';
        if (data?.nodes) {
          const duplicate = data.nodes.find(n => n.id !== node?.id && (n.ipAddress === v || n.ip_address === v));
          if (duplicate) return `IP already assigned to ${duplicate.name || duplicate.id}.`;
        }
        return '';
      }
      case 'location': {
        const v = (value || '').trim();
        if (!v) return 'Location (Site) is required.';
        if (v.length < 2 || v.length > 50) return 'Location must be between 2 and 50 characters.';
        return '';
      }
      case 'building': {
        if (currentFormData.type !== 'switch') return '';
        const v = (value || '').trim();
        if (!v) return 'Building is required for switch nodes.';
        if (v.length < 2 || v.length > 60) return 'Building name must be between 2 and 60 characters.';
        return '';
      }
      default:
        return '';
    }
  }, [formData, node, data]);

  const errors = useMemo(() => ({
    id: validateField('id', formData.id),
    name: validateField('name', formData.name),
    ipAddress: validateField('ipAddress', formData.ipAddress),
    location: validateField('location', formData.location),
    building: validateField('building', formData.building),
  }), [validateField, formData]);

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleChange = (field, val) => {
    const updated = { ...formData, [field]: val };
    if (field === 'type' && val === 'router') {
      updated.building = '';
      if (updated.tier === 'access') updated.tier = 'distribution';
    } else if (field === 'type' && val === 'switch') {
      if (updated.tier !== 'access') updated.tier = 'access';
    }
    setFormData(updated);
  };

  const resolveGroupName = useCallback((rawName) => {
    const trimmed = (rawName || '').trim();
    if (!trimmed) return '';
    const existing = availableGroups.find(g => g.toLowerCase() === trimmed.toLowerCase());
    return existing || trimmed;
  }, [availableGroups]);

  const addGroup = (e) => {
    if (e) e.preventDefault();
    const trimmed = groupInput.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      setGroupInputError('Group name must be 50 characters or fewer.');
      return;
    }
    const canonical = resolveGroupName(trimmed);
    if (formData.groups.some(g => g.toLowerCase() === canonical.toLowerCase())) {
      setGroupInputError(`Node is already in group "${canonical}".`);
      return;
    }
    setFormData(prev => ({ ...prev, groups: [...prev.groups, canonical] }));
    setGroupInput('');
    setGroupInputError('');
  };

  const removeGroup = (groupToRemove) => {
    setFormData(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g !== groupToRemove),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      id: true,
      name: true,
      ipAddress: true,
      location: true,
      building: true,
    });

    const pendingGroup = groupInput.trim();
    if (pendingGroup.length > 50) {
      setGroupInputError('Group name must be 50 characters or fewer.');
      return;
    }

    const hasErrors = Object.values(errors).some(err => Boolean(err));
    if (hasErrors) {
      return;
    }

    const finalGroups = [...formData.groups];
    if (pendingGroup) {
      const canonical = resolveGroupName(pendingGroup);
      if (!finalGroups.some(g => g.toLowerCase() === canonical.toLowerCase())) {
        finalGroups.push(canonical);
      }
    }

    onSave({
      ...formData,
      id: formData.id.trim(),
      name: formData.name.trim(),
      ipAddress: formData.ipAddress.trim(),
      location: formData.location.trim(),
      building: formData.type === 'switch' ? (formData.building.trim() || null) : null,
      groups: finalGroups,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>{node ? 'Edit Node' : 'Add Node'}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {!node && (
            <div className="form-group">
              <label htmlFor="modal-node-id">
                Node ID <span className="field-required">*</span>
              </label>
              <input
                id="modal-node-id"
                value={formData.id}
                onChange={e => handleChange('id', e.target.value)}
                onBlur={() => handleBlur('id')}
                className={touched.id && errors.id ? 'input-invalid' : ''}
                placeholder="e.g. S-1351"
              />
              {touched.id && errors.id && (
                <span className="field-error-msg">⚠️ {errors.id}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="modal-node-name">
              Name <span className="field-required">*</span>
            </label>
            <input
              id="modal-node-name"
              value={formData.name}
              onChange={e => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              className={touched.name && errors.name ? 'input-invalid' : ''}
              placeholder="e.g. Switch-1351"
            />
            {touched.name && errors.name && (
              <span className="field-error-msg">⚠️ {errors.name}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-type">Type</label>
              <select
                id="modal-node-type"
                value={formData.type}
                onChange={e => handleChange('type', e.target.value)}
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
                onChange={e => handleChange('tier', e.target.value)}
              >
                <option value="access">Access</option>
                <option value="distribution">Distribution</option>
                <option value="core">Core</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-ip">
                IP Address <span className="field-required">*</span>
              </label>
              <input
                id="modal-node-ip"
                value={formData.ipAddress}
                onChange={e => handleChange('ipAddress', e.target.value)}
                onBlur={() => handleBlur('ipAddress')}
                className={touched.ipAddress && errors.ipAddress ? 'input-invalid' : ''}
                placeholder="e.g. 10.0.12.5"
              />
              {touched.ipAddress && errors.ipAddress && (
                <span className="field-error-msg">⚠️ {errors.ipAddress}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="modal-node-status">Status</label>
              <select
                id="modal-node-status"
                value={formData.status}
                onChange={e => handleChange('status', e.target.value)}
              >
                <option value="connected">Connected (UP)</option>
                <option value="down">Down</option>
                <option value="connecting">Connecting</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-node-location">
                Location (Site) <span className="field-required">*</span>
              </label>
              <input
                id="modal-node-location"
                list="locations-list"
                value={formData.location}
                onChange={e => handleChange('location', e.target.value)}
                onBlur={() => handleBlur('location')}
                className={touched.location && errors.location ? 'input-invalid' : ''}
                placeholder="e.g. Data Center 1"
              />
              <datalist id="locations-list">
                {locationSuggestions.map(loc => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
              {touched.location && errors.location && (
                <span className="field-error-msg">⚠️ {errors.location}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="modal-node-building">
                Building {formData.type === 'switch' && <span className="field-required">*</span>}
              </label>
              <input
                id="modal-node-building"
                list="buildings-list"
                value={formData.building || ''}
                onChange={e => handleChange('building', e.target.value)}
                onBlur={() => handleBlur('building')}
                className={touched.building && errors.building ? 'input-invalid' : ''}
                placeholder={formData.type === 'switch' ? 'e.g. DC1 Building A' : 'Not applicable for routers'}
                disabled={formData.type === 'router'}
              />
              <datalist id="buildings-list">
                {buildingSuggestions.map(bldg => (
                  <option key={bldg} value={bldg} />
                ))}
              </datalist>
              {touched.building && errors.building && (
                <span className="field-error-msg">⚠️ {errors.building}</span>
              )}
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
                onChange={e => {
                  setGroupInput(e.target.value);
                  if (groupInputError) setGroupInputError('');
                }}
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
            {groupInputError && (
              <span className="field-error-msg" style={{ marginTop: 4 }}>⚠️ {groupInputError}</span>
            )}
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
