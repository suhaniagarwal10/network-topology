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

  const resolvedTargetId = useMemo(() => {
    const t = target.trim().toLowerCase();
    if (!t) return null;
    
    if (data?.nodesById.has(target.trim())) return target.trim();
    
    const matchedNode = (data?.nodes || []).find(n => n.name.toLowerCase() === t);
    return matchedNode ? matchedNode.id : null;
  }, [data, target]);

  const targetInterfaces = useMemo(() => {
    if (!resolvedTargetId) return [];
    return data?.interfacesByNode.get(resolvedTargetId) || [];
  }, [data, resolvedTargetId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalTargetId = resolvedTargetId || target.trim();
    if (!finalTargetId) return;
    
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
        link_id: `L-${initialSource}-${finalTargetId}-${Date.now()}`,
        source: initialSource,
        target: finalTargetId,
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
            Target Node:
            <input 
              list="target-nodes-list"
              value={target} 
              onChange={e => setTarget(e.target.value)} 
              placeholder="e.g. Switch-0042"
              required
              disabled={isEditing}
              style={{ background: isEditing ? '#334155' : '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}
            />
            <datalist id="target-nodes-list">
              {(data?.nodes || []).map(n => (
                <option key={n.id} value={n.name}>{n.id}</option>
              ))}
            </datalist>
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
                  disabled={!resolvedTargetId || targetInterfaces.length === 0}
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
