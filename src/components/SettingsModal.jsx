import { useState } from 'react';

export default function SettingsModal({ settings, onSave, onClose }) {
  const [formData, setFormData] = useState({ ...settings });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>Display Settings</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <strong>Node Label Formatting</strong>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Choose how nodes appear on the canvas and in lists.</span>
            <select
              value={formData.nodeLabel}
              onChange={e => setFormData({ ...formData, nodeLabel: e.target.value })}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '4px' }}
            >
              <option value="name">Name (e.g. Core Router Alpha)</option>
              <option value="id">Node ID (e.g. R-001)</option>
              <option value="ip">IP Address (e.g. 10.0.0.1)</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <strong>Interface Label Formatting</strong>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Choose how interfaces appear in link tooltips.</span>
            <select
              value={formData.interfaceLabel}
              onChange={e => setFormData({ ...formData, interfaceLabel: e.target.value })}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '4px' }}
            >
              <option value="name">Name (e.g. TenGigE0/0/0/1)</option>
              <option value="id">Interface ID (e.g. IF-001)</option>
            </select>
          </label>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">Save Settings</button>
          </div>
        </form>
      </div>
    </div>
  );
}
