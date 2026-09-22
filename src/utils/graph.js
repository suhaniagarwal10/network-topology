// Colors for each severity level. "minor" is folded into the same gold as
// "warning" so every node maps to one of the 4 legend colors (Normal /
// Warning / Major / Critical) — matches the reference UI, which has no
// separate "minor" bucket.
export const SEV_COLOR = {
  normal: '#22c55e',
  minor: '#eab308',
  warning: '#eab308',
  major: '#f97316',
  critical: '#ef4444',
};

export function statusColor(status) {
  if (status === 'down') return '#ef4444';
  if (status === 'connecting') return '#eab308';
  return '#22c55e';
}

export function bwLabel(mbps) {
  if (mbps >= 1000) return `${mbps / 1000}G`;
  return `${mbps}M`;
}

// "now" is fixed to the dataset's generatedAt so demo alarm ages don't drift
// every time you open the app. Swap NOW for `new Date()` once alarms come
// from a live feed instead of the generated sample dataset.
export function timeAgo(iso, now) {
  const d = new Date(iso.replace(' ', 'T'));
  const mins = Math.round((now - d) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/* ------------------------------------------------------------------ *
 * Severity helpers — shared by the graph, the building cards and the
 * details panel so "worst severity" always means the same thing.
 * ------------------------------------------------------------------ */

export const SEVERITY_ORDER = ['normal', 'minor', 'warning', 'major', 'critical'];

export function severityRank(severity) {
  const i = SEVERITY_ORDER.indexOf(severity);
  return i === -1 ? 0 : i;
}

/** Highest severity in a list, using the dataset's own severity vocabulary. */
export function worstSeverity(severities) {
  let worst = 'normal';
  for (const s of severities) {
    if (severityRank(s) > severityRank(worst)) worst = s;
  }
  return worst;
}

export function severityColor(severity) {
  return SEV_COLOR[severity] || '#5b6472';
}

/** Icons used in search results and breadcrumbs to distinguish entity kinds. */
export const KIND_GLYPH = {
  building: '\u{1F3E2}', // 🏢
  switch: '\u{1F500}', // 🔀
  router: '\u{1F310}', // 🌐
};

export function tierLabel(node) {
  if (!node) return '';
  if (node.tier === 'core') return 'Core router';
  if (node.tier === 'distribution') return 'Distribution router';
  if (node.type === 'switch') return 'Access switch';
  return node.type;
}

/**
 * Display-level health roll-up for a building.
 *
 * "Worst severity" is the literal maximum across the building's switches and
 * is shown as its own row in the details panel — but with 50+ switches per
 * building almost every building contains at least one critical device, so
 * colouring the map by it would paint everything red and tell you nothing.
 *
 * For the *colour* we therefore use the proportion of affected switches.
 * Thresholds are a presentation choice (documented here so they're easy to
 * tune); every input number is counted from the real dataset.
 */
export function buildingHealthLevel(stats) {
  if (!stats || !stats.total) return 'normal';
  const criticalish = (stats.severity.critical + stats.down) / stats.total;
  const majorish = stats.severity.major / stats.total;
  const warnish = (stats.severity.warning + stats.severity.minor) / stats.total;

  if (criticalish >= 0.1) return 'critical';
  if (criticalish >= 0.05 || majorish >= 0.1) return 'major';
  if (majorish > 0 || warnish >= 0.08) return 'warning';
  if (stats.severity.normal === stats.total) return 'normal';
  return 'warning';
}
