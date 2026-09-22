import { useState, useEffect } from 'react';

export default function MonitorModal({ node, onClose }) {
  const [cpu, setCpu] = useState(Array(30).fill(0).map(() => Math.random() * 40 + 20));
  const [ram, setRam] = useState(Array(30).fill(0).map(() => Math.random() * 20 + 40));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCpu(prev => {
        const next = [...prev.slice(1), Math.min(100, Math.max(0, prev[prev.length - 1] + (Math.random() * 30 - 15)))];
        return next;
      });
      setRam(prev => {
        const next = [...prev.slice(1), Math.min(100, Math.max(0, prev[prev.length - 1] + (Math.random() * 10 - 5)))];
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const renderSparkline = (data, color) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 2, background: '#0f172a', padding: 8, borderRadius: 4, marginTop: 8 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, background: color, height: `${v}%`, transition: 'height 0.5s ease' }} />
      ))}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: '90%' }}>
        <h2>Live Diagnostics: {node.name}</h2>
        <div className="details-sub">{node.id} · {node.ipAddress}</div>
        
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h4 style={{ margin: 0, color: '#f8fafc' }}>CPU Usage</h4>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{cpu[cpu.length - 1].toFixed(1)}%</span>
          </div>
          {renderSparkline(cpu, '#3b82f6')}
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h4 style={{ margin: 0, color: '#f8fafc' }}>Memory Usage</h4>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{ram[ram.length - 1].toFixed(1)}%</span>
          </div>
          {renderSparkline(ram, '#eab308')}
        </div>

        <div className="modal-actions" style={{ marginTop: 32 }}>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}
