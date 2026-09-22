import { useState, useEffect } from 'react';

export default function NodeModal({ node, onSave, onClose }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'switch',
    tier: 'access',
    ipAddress: '',
    location: 'Building-A',
    status: 'UP'
  });

  useEffect(() => {
    if (node) {
      setFormData({
        id: node.id || '',
        name: node.name || node.label || '',
        type: node.type || 'switch',
        tier: node.tier || 'access',
        ipAddress: node.ipAddress || node.ip_address || '',
        location: node.location || '',
        status: node.status || 'UP'
      });
    }
  }, [node]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{node ? 'Edit Node' : 'Add Node'}</h2>
        <form onSubmit={handleSubmit}>
          {!node && (
            <div className="form-group">
              <label>Node ID</label>
              <input 
                required 
                value={formData.id} 
                onChange={e => setFormData({...formData, id: e.target.value})} 
                placeholder="e.g. S999"
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Name</label>
            <input 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="router">Router</option>
                <option value="switch">Switch</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tier</label>
              <select value={formData.tier} onChange={e => setFormData({...formData, tier: e.target.value})}>
                <option value="core">Core</option>
                <option value="distribution">Distribution</option>
                <option value="access">Access</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>IP Address</label>
              <input 
                value={formData.ipAddress} 
                onChange={e => setFormData({...formData, ipAddress: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="UP">UP</option>
                <option value="DOWN">DOWN</option>
                <option value="WARNING">WARNING</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Location (Building)</label>
            <input 
              value={formData.location} 
              onChange={e => setFormData({...formData, location: e.target.value})} 
              placeholder="e.g. DC1 A"
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">Cancel</button>
            <button type="submit" className="btn-save">{node ? 'Save Changes' : 'Add Node'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
