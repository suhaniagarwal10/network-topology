import { DEFAULT_SETTINGS } from '../utils/settings.js';

const LINK_WIDTH_MIN = 0.25;
const LINK_WIDTH_MAX = 3;
const LINK_PRESETS = [
  { label: 'Thin', value: 0.5 },
  { label: 'Default', value: 1 },
  { label: 'Thick', value: 2 },
];

/**
 * Display settings, shown in the right-hand panel in place of the details
 * inspector. Every change applies to the canvas immediately.
 */
export default function SettingsPanel({ settings, onChange, onClose }) {
  const update = (patch) => onChange({ ...settings, ...patch });
  const linkWidth = settings.linkWidth ?? DEFAULT_SETTINGS.linkWidth;

  return (
    <aside className="details settings-panel">
      <div className="settings-head">
        <h2>⚙️ Display Settings</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>
      <div className="details-sub">Changes apply to the map right away.</div>

      <div className="section-title">Links</div>
      <div className="settings-field">
        <div className="settings-label-row">
          <label htmlFor="setting-link-width">Link thickness</label>
          <span className="settings-value">{linkWidth.toFixed(2).replace(/\.?0+$/, '')}×</span>
        </div>
        <input
          id="setting-link-width"
          type="range"
          className="settings-range"
          min={LINK_WIDTH_MIN}
          max={LINK_WIDTH_MAX}
          step={0.25}
          value={linkWidth}
          onChange={(e) => update({ linkWidth: Number(e.target.value) })}
        />
        <div className="settings-range-scale">
          <span>Thinner</span>
          <span>Thicker</span>
        </div>
        <svg className="settings-preview" viewBox="0 0 240 46" aria-hidden="true">
          {[10, 23, 36].map((y, i) => (
            <line
              key={y}
              x1="8"
              x2="232"
              y1={y}
              y2={y}
              stroke={i === 1 ? '#f59e0b' : '#64748b'}
              strokeWidth={Math.max(0.5, 2.2 * linkWidth)}
              strokeLinecap="round"
              strokeDasharray={i === 2 ? '6 5' : undefined}
            />
          ))}
        </svg>
        <div className="settings-presets">
          {LINK_PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`settings-chip${linkWidth === p.value ? ' on' : ''}`}
              onClick={() => update({ linkWidth: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Labels</div>
      <div className="settings-field">
        <label htmlFor="setting-node-label">Node labels</label>
        <span className="settings-hint">How nodes appear on the canvas and in lists.</span>
        <select
          id="setting-node-label"
          value={settings.nodeLabel}
          onChange={(e) => update({ nodeLabel: e.target.value })}
        >
          <option value="name">Name (e.g. Core Router Alpha)</option>
          <option value="id">Node ID (e.g. R-001)</option>
          <option value="ip">IP Address (e.g. 10.0.0.1)</option>
        </select>
      </div>
      <div className="settings-field">
        <label htmlFor="setting-interface-label">Interface labels</label>
        <span className="settings-hint">How interfaces appear in link tooltips.</span>
        <select
          id="setting-interface-label"
          value={settings.interfaceLabel}
          onChange={(e) => update({ interfaceLabel: e.target.value })}
        >
          <option value="name">Name (e.g. TenGigE0/0/0/1)</option>
          <option value="id">Interface ID (e.g. IF-001)</option>
        </select>
      </div>

      <button type="button" className="settings-reset" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
        Reset to defaults
      </button>
    </aside>
  );
}
