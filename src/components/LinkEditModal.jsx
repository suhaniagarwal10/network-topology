import { useState, useMemo } from 'react';

export default function LinkEditModal({ sourceNode, linkBundle, data, onSave, onClose }) {
  const isEditing = !!linkBundle;
  const initialTarget = isEditing ? linkBundle.target : '';
  const initialSource = isEditing ? linkBundle.source : (sourceNode ? sourceNode.id : '');
  const initialBandwidth = isEditing ? (linkBundle.data?.bandwidthMbps || 1000) : 1000;
  const initialStatus = isEditing ? (linkBundle.data?.downCount > 0 ? 'down' : 'up') : 'up';

  const [target, setTarget] = useState(initialTarget);
  const [bandwidth, setBandwidth] = useState(initialBandwidth);
  const [status, setStatus] = useState(initialStatus);
  const [sourceIface, setSourceIface] = useState('');
  const [targetIface, setTargetIface] = useState('');

  const sourceInterfaces = useMemo(() => {
    return data?.interfacesByNode.get(initialSource) || [];
  }, [data, initialSource]);

  const targetInterfaces = useMemo(() => {
    return data?.interfacesByNode.get(target) || [];
  }, [data, target]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!target.trim()) return;
    
    if (isEditing) {
      onSave({
        isEdit: true,
        linkIds: linkBundle.data.linkIds,
        bandwidth_mbps: Number(bandwidth),
        status
      });
    } else {
      onSave({
        isEdit: false,
        link_id: `L-${initialSource}-${target}-${Date.now()}`,
        source: initialSource,
        target: target.trim(),
        source_interface_id: sourceIface || undefined,
        target_interface_id: targetIface || undefined,
        bandwidth_mbps: Number(bandwidth),
        status
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEditing ? 'Edit Link Bundle' : `Add Link from ${sourceNode?.name || initialSource}`}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
            Target Node ID:
            <input 
              value={target} 
              onChange={e => setTarget(e.target.value)} 
              placeholder="e.g. Switch-0042"
              required
              disabled={isEditing}
              style={{ background: isEditing ? '#334155' : '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
            />
          </label>
          
          {!isEditing && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
                Source Interface:
                <select 
                  value={sourceIface} 
                  onChange={e => setSourceIface(e.target.value)}
                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
                >
                  <option value="">-- Auto Assign --</option>
                  {sourceInterfaces.map(i => (
                    <option key={i.interface_id} value={i.interface_id}>{i.name} ({i.status})</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
                Target Interface:
                <select 
                  value={targetIface} 
                  onChange={e => setTargetIface(e.target.value)}
                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
                  disabled={!target.trim() || targetInterfaces.length === 0}
                >
                  <option value="">
                    {targetInterfaces.length === 0 && target.trim() ? 'No interfaces found' : '-- Auto Assign --'}
                  </option>
                  {targetInterfaces.map(i => (
                    <option key={i.interface_id} value={i.interface_id}>{i.name} ({i.status})</option>
                  ))}
                </select>
              </label>
            </>
          )}
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
            Bandwidth (Mbps):
            <input 
              type="number"
              value={bandwidth} 
              onChange={e => setBandwidth(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
            Status:
            <select 
              value={status} 
              onChange={e => setStatus(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
            >
              <option value="up">UP</option>
              <option value="down">DOWN</option>
            </select>
          </label>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">{isEditing ? 'Save Changes' : 'Add Link'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
