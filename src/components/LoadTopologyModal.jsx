import { useState, useEffect } from 'react';

export default function LoadTopologyModal({
  isOpen,
  onClose,
  onLoadCustom,
  onResetDefault,
  isCustomLoaded = false,
  activeDatasetName = 'Default Dataset',
}) {
  const [importMode, setImportMode] = useState('separate'); // 'separate' | 'bundle'
  const [filesState, setFilesState] = useState({
    nodes: { file: null, data: null, error: null, count: 0 },
    interfaces: { file: null, data: null, error: null, count: 0 },
    links: { file: null, data: null, error: null, count: 0 },
    alarms: { file: null, data: null, error: null, count: 0 },
  });
  const [bundleState, setBundleState] = useState({
    file: null,
    data: null,
    error: null,
    stats: null,
  });
  const [generalError, setGeneralError] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSeparateFileChange = (type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const parsed = JSON.parse(text);

        // Normalize if wrapped inside an object with key
        const items = Array.isArray(parsed)
          ? parsed
          : (parsed[type] || parsed.items || parsed.data || null);

        if (!Array.isArray(items)) {
          setFilesState((prev) => ({
            ...prev,
            [type]: {
              file,
              data: null,
              error: `Expected a JSON array for ${type} or an object with a "${type}" array.`,
              count: 0,
            },
          }));
          return;
        }

        setFilesState((prev) => ({
          ...prev,
          [type]: {
            file,
            data: items,
            error: null,
            count: items.length,
          },
        }));
        setGeneralError('');
      } catch (err) {
        setFilesState((prev) => ({
          ...prev,
          [type]: {
            file,
            data: null,
            error: `Invalid JSON: ${err.message}`,
            count: 0,
          },
        }));
      }
    };
    reader.onerror = () => {
      setFilesState((prev) => ({
        ...prev,
        [type]: {
          file,
          data: null,
          error: 'Failed to read file.',
          count: 0,
        },
      }));
    };
    reader.readAsText(file);
  };

  const handleBundleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const parsed = JSON.parse(text);

        if (typeof parsed !== 'object' || parsed === null) {
          setBundleState({
            file,
            data: null,
            error: 'Bundle must be a JSON object containing nodes, links, etc.',
            stats: null,
          });
          return;
        }

        const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        const interfaces = Array.isArray(parsed.interfaces) ? parsed.interfaces : [];
        const links = Array.isArray(parsed.links) ? parsed.links : [];
        const alarms = Array.isArray(parsed.alarms) ? parsed.alarms : [];

        if (nodes.length === 0) {
          setBundleState({
            file,
            data: null,
            error: 'Bundle does not contain a valid "nodes" array.',
            stats: null,
          });
          return;
        }

        setBundleState({
          file,
          data: {
            meta: parsed.meta || {
              name: file.name.replace(/\.[^/.]+$/, ''),
              nodeCount: nodes.length,
              generatedAt: new Date().toISOString(),
            },
            nodes,
            interfaces,
            links,
            alarms,
          },
          error: null,
          stats: {
            nodes: nodes.length,
            interfaces: interfaces.length,
            links: links.length,
            alarms: alarms.length,
          },
        });
        setGeneralError('');
      } catch (err) {
        setBundleState({
          file,
          data: null,
          error: `Invalid JSON bundle: ${err.message}`,
          stats: null,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleApplySeparate = () => {
    if (!filesState.nodes.data) {
      setGeneralError('Please upload at least the nodes.json file.');
      return;
    }

    const nodes = filesState.nodes.data || [];
    const interfaces = filesState.interfaces.data || [];
    const links = filesState.links.data || [];
    const alarms = filesState.alarms.data || [];

    const rawPayload = {
      meta: {
        name: 'Custom Uploaded Topology',
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        interfaceCount: interfaces.length,
        linkCount: links.length,
        alarmCount: alarms.length,
      },
      nodes,
      interfaces,
      links,
      alarms,
    };

    onLoadCustom(rawPayload);
    onClose();
  };

  const handleApplyBundle = () => {
    if (!bundleState.data) {
      setGeneralError('Please choose a valid JSON bundle file.');
      return;
    }
    onLoadCustom(bundleState.data);
    onClose();
  };

  const handleLoadSampleData = async () => {
    try {
      setLoadingSample(true);
      setGeneralError('');
      const res = await fetch('/sample-data/sample-topology-bundle.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching sample data`);
      const sampleBundle = await res.json();
      onLoadCustom(sampleBundle);
      onClose();
    } catch (err) {
      setGeneralError(`Failed to load sample dataset: ${err.message}`);
    } finally {
      setLoadingSample(false);
    }
  };

  const canApplySeparate = Boolean(filesState.nodes.data);
  const canApplyBundle = Boolean(bundleState.data);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content load-topology-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 780,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#111827',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                color: '#fff',
                fontSize: '1.25rem',
              }}
            >
              📂
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                Load Custom Topology
              </h2>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Import your own JSON files for nodes, interfaces, links, and alarms, or restore the default topology.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
            }}
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>

        {/* Current Dataset Status Banner */}
        <div
          style={{
            padding: '10px 20px',
            background: isCustomLoaded ? 'rgba(56, 189, 248, 0.12)' : 'rgba(148, 163, 184, 0.08)',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.86rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: isCustomLoaded ? '#38bdf8' : '#94a3b8', fontWeight: '600' }}>
              Active Topology:
            </span>
            <span
              style={{
                background: isCustomLoaded ? '#0369a1' : '#334155',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: '0.78rem',
                fontWeight: 'bold',
              }}
            >
              {activeDatasetName}
            </span>
          </div>
          {isCustomLoaded && onResetDefault && (
            <button
              type="button"
              onClick={() => {
                onResetDefault();
                onClose();
              }}
              style={{
                background: 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '3px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.78rem',
              }}
            >
              ↺ Restore Default (1,500 Devices)
            </button>
          )}
        </div>

        {/* Tab mode selection */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '12px 20px',
            borderBottom: '1px solid #1e293b',
            background: '#0b1324',
          }}
        >
          <button
            type="button"
            onClick={() => setImportMode('separate')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: importMode === 'separate' ? '#0284c7' : 'transparent',
              color: importMode === 'separate' ? '#ffffff' : '#94a3b8',
              fontWeight: importMode === 'separate' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '0.88rem',
            }}
          >
            📁 4 Separate Files (nodes, interfaces, links, alarms)
          </button>
          <button
            type="button"
            onClick={() => setImportMode('bundle')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: importMode === 'bundle' ? '#0284c7' : 'transparent',
              color: importMode === 'bundle' ? '#ffffff' : '#94a3b8',
              fontWeight: importMode === 'bundle' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '0.88rem',
            }}
          >
            📦 1 Combined Bundle (.json)
          </button>
        </div>

        {/* Main Form Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
          {generalError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: '0.88rem',
              }}
            >
              {generalError}
            </div>
          )}

          {importMode === 'separate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 4 }}>
                Select the JSON files exported from your network inventory or CMDB:
              </div>

              {/* Nodes File */}
              <FileSlot
                label="Nodes JSON (Required)"
                badge="nodes"
                description="List of routers, switches, and standalone devices"
                fileState={filesState.nodes}
                onChange={(e) => handleSeparateFileChange('nodes', e)}
                required
              />

              {/* Interfaces File */}
              <FileSlot
                label="Interfaces JSON (Optional)"
                badge="interfaces"
                description="Physical/logical interface names and IP addresses per device"
                fileState={filesState.interfaces}
                onChange={(e) => handleSeparateFileChange('interfaces', e)}
              />

              {/* Links File */}
              <FileSlot
                label="Links JSON (Optional)"
                badge="links"
                description="Interconnecting physical links between interfaces or devices"
                fileState={filesState.links}
                onChange={(e) => handleSeparateFileChange('links', e)}
              />

              {/* Alarms File */}
              <FileSlot
                label="Alarms JSON (Optional)"
                badge="alarms"
                description="Active alarm events mapped to node IDs"
                fileState={filesState.alarms}
                onChange={(e) => handleSeparateFileChange('alarms', e)}
              />
            </div>
          )}

          {importMode === 'bundle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: '0.86rem', color: '#94a3b8' }}>
                Upload a single combined JSON bundle containing <code style={{ color: '#38bdf8' }}>{'{ nodes: [...], interfaces: [...], links: [...], alarms: [...] }'}</code>:
              </div>

              <div
                style={{
                  border: '2px dashed #334155',
                  borderRadius: 8,
                  padding: 24,
                  textAlign: 'center',
                  background: '#131d31',
                }}
              >
                <input
                  type="file"
                  id="bundle-file-input"
                  accept=".json,application/json"
                  onChange={handleBundleFileChange}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="bundle-file-input"
                  style={{
                    display: 'inline-block',
                    background: '#0284c7',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    marginBottom: 10,
                  }}
                >
                  Choose Bundle JSON File
                </label>
                {bundleState.file && (
                  <div style={{ color: '#38bdf8', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    Selected: {bundleState.file.name} ({(bundleState.file.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                {bundleState.stats && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 16,
                      marginTop: 12,
                      fontSize: '0.85rem',
                      color: '#a7f3d0',
                    }}
                  >
                    <span>✓ {bundleState.stats.nodes} Nodes</span>
                    <span>✓ {bundleState.stats.interfaces} Interfaces</span>
                    <span>✓ {bundleState.stats.links} Links</span>
                    <span>✓ {bundleState.stats.alarms} Alarms</span>
                  </div>
                )}
                {bundleState.error && (
                  <div style={{ color: '#f87171', fontSize: '0.85rem', marginTop: 8 }}>
                    {bundleState.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick-test banner */}
          <div
            style={{
              marginTop: 20,
              padding: '14px 16px',
              background: '#1e293b',
              borderRadius: 8,
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.92rem', marginBottom: 2 }}>
                ⚡ Test with Sample Dataset (20 Devices)
              </div>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Pre-built test dataset with 2 Core routers, 4 Distribution routers, 12 switches across 2 buildings with groups, 2 standalone units, links, and alarms. Files are also saved in <code style={{ color: '#38bdf8' }}>test-data/</code> for manual testing.
              </div>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleData}
              disabled={loadingSample}
              style={{
                background: '#8b5cf6',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontWeight: 'bold',
                cursor: loadingSample ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.88rem',
              }}
            >
              {loadingSample ? 'Loading...' : '⚡ Load Sample Data'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #1e293b',
            background: '#111827',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            {importMode === 'separate'
              ? `${filesState.nodes.count} nodes, ${filesState.interfaces.count} ifaces, ${filesState.links.count} links, ${filesState.alarms.count} alarms selected`
              : bundleState.stats
              ? `${bundleState.stats.nodes} nodes detected`
              : 'No bundle loaded'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid #475569',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.88rem',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={importMode === 'separate' ? handleApplySeparate : handleApplyBundle}
              disabled={importMode === 'separate' ? !canApplySeparate : !canApplyBundle}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                background: (importMode === 'separate' ? canApplySeparate : canApplyBundle)
                  ? '#0284c7'
                  : '#334155',
                color: (importMode === 'separate' ? canApplySeparate : canApplyBundle)
                  ? '#ffffff'
                  : '#64748b',
                border: 'none',
                fontWeight: 'bold',
                cursor: (importMode === 'separate' ? canApplySeparate : canApplyBundle)
                  ? 'pointer'
                  : 'not-allowed',
                fontSize: '0.88rem',
              }}
            >
              Generate Topology
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileSlot({ label, badge, description, fileState, onChange, required = false }) {
  const inputId = `file-input-${badge}`;
  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: '600', color: '#f1f5f9', fontSize: '0.88rem' }}>{label}</span>
          {fileState.data && (
            <span
              style={{
                background: 'rgba(34, 197, 94, 0.16)',
                color: '#4ade80',
                border: '1px solid #22c55e',
                borderRadius: 10,
                padding: '1px 8px',
                fontSize: '0.74rem',
                fontWeight: 'bold',
              }}
            >
              ✓ {fileState.count} {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
          {fileState.file ? fileState.file.name : description}
        </div>
        {fileState.error && (
          <div style={{ color: '#f87171', fontSize: '0.76rem', marginTop: 2 }}>
            {fileState.error}
          </div>
        )}
      </div>

      <div>
        <input
          type="file"
          id={inputId}
          accept=".json,application/json"
          onChange={onChange}
          style={{ display: 'none' }}
        />
        <label
          htmlFor={inputId}
          style={{
            display: 'inline-block',
            background: fileState.data ? '#334155' : required ? '#0284c7' : '#1e293b',
            border: fileState.data ? '1px solid #475569' : '1px solid #0284c7',
            color: '#f8fafc',
            padding: '5px 12px',
            borderRadius: 5,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: '600',
            whiteSpace: 'nowrap',
          }}
        >
          {fileState.file ? 'Change File' : 'Browse JSON...'}
        </label>
      </div>
    </div>
  );
}
