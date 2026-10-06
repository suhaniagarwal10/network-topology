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
  const [touched, setTouched] = useState({});

  const sourceInterfaces = useMemo(() => {
    return data?.interfacesByNode.get(initialSource) || [];
  }, [data, initialSource]);

  const resolvedTargetId = useMemo(() => {
    const t = target.trim().toLowerCase();
    if (!t) return null;
    
    if (data?.nodesById.has(target.trim())) return target.trim();
    
    const matchedNode = (data?.nodes || []).find(n => (n.name || '').toLowerCase() === t);
    return matchedNode ? matchedNode.id : null;
  }, [data, target]);

  const targetInterfaces = useMemo(() => {
    if (!resolvedTargetId) return [];
    return data?.interfacesByNode.get(resolvedTargetId) || [];
  }, [data, resolvedTargetId]);

  const validateTarget = (val) => {
    if (isEditing) return '';
    const t = (val || '').trim();
    if (!t) return 'Target node is required.';
    if (t.toLowerCase() === initialSource.toLowerCase() || (resolvedTargetId && resolvedTargetId === initialSource)) {
      return 'Cannot link a node to itself.';
    }
    if (!resolvedTargetId) {
      return `Node "${t}" not found in topology.`;
    }
    return '';
  };

  const validateBandwidth = (val) => {
    const str = String(val ?? '').trim();
    if (!str) return 'Bandwidth is required.';
    const num = Number(str);
    if (Number.isNaN(num)) return 'Bandwidth must be a valid number.';
    if (num <= 0) return 'Bandwidth must be greater than 0 Mbps.';
    if (num > 10000000) return 'Bandwidth cannot exceed 10,000,000 Mbps.';
    return '';
  };

  const targetError = validateTarget(target);
  const bandwidthError = validateBandwidth(bandwidth);

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({ target: true, bandwidth: true });

    if (targetError || bandwidthError) {
      return;
    }

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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2>{isEditing ? 'Edit Link Bundle' : `Add Link from ${sourceNode?.name || initialSource}`}</h2>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div className="form-group">
            <label htmlFor="link-target-node">
              Target Node {!isEditing && <span className="field-required">*</span>}
            </label>
            <input 
              id="link-target-node"
              list="target-nodes-list"
              value={target} 
              onChange={e => setTarget(e.target.value)} 
              onBlur={() => setTouched(prev => ({ ...prev, target: true }))}
              placeholder="e.g. Switch-0042 or S-0042"
              disabled={isEditing}
              className={touched.target && targetError ? 'input-invalid' : ''}
              style={{ background: isEditing ? '#334155' : undefined }}
            />
            <datalist id="target-nodes-list">
              {(data?.nodes || []).filter(n => n.id !== initialSource).map(n => (
                <option key={n.id} value={n.name}>{n.id}</option>
              ))}
            </datalist>
            {touched.target && targetError && (
              <span className="field-error-msg">⚠️ {targetError}</span>
            )}
          </div>
          
          {!isEditing && (
            <>
              <div className="form-group">
                <label htmlFor="link-src-iface">Source Interface</label>
                <select 
                  id="link-src-iface"
                  value={sourceIface} 
                  onChange={e => setSourceIface(e.target.value)}
                >
                  <option value="">-- Auto Assign --</option>
                  {sourceInterfaces.map(i => (
                    <option key={i.interface_id} value={i.interface_id}>{i.name} ({i.status})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="link-tgt-iface">Target Interface</label>
                <select 
                  id="link-tgt-iface"
                  value={targetIface} 
                  onChange={e => setTargetIface(e.target.value)}
                  disabled={!resolvedTargetId || targetInterfaces.length === 0}
                >
                  <option value="">
                    {targetInterfaces.length === 0 && target.trim() ? 'No interfaces found' : '-- Auto Assign --'}
                  </option>
                  {targetInterfaces.map(i => (
                    <option key={i.interface_id} value={i.interface_id}>{i.name} ({i.status})</option>
                  ))}
                </select>
              </div>
            </>
          )}
          
          <div className="form-group">
            <label htmlFor="link-bandwidth">
              Bandwidth (Mbps) <span className="field-required">*</span>
            </label>
            <input 
              id="link-bandwidth"
              type="number"
              min="1"
              max="10000000"
              value={bandwidth} 
              onChange={e => setBandwidth(e.target.value)}
              onBlur={() => setTouched(prev => ({ ...prev, bandwidth: true }))}
              className={touched.bandwidth && bandwidthError ? 'input-invalid' : ''}
              placeholder="e.g. 1000"
            />
            {touched.bandwidth && bandwidthError && (
              <span className="field-error-msg">⚠️ {bandwidthError}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="link-status">Status</label>
            <select 
              id="link-status"
              value={status} 
              onChange={e => setStatus(e.target.value)}
            >
              <option value="up">UP</option>
              <option value="down">DOWN</option>
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">{isEditing ? 'Save Changes' : 'Add Link'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
