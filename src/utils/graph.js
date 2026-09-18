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
