export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    ['active', 'operational', 'resolved', 'success', 'accepted'].includes(normalized) ? 'success' :
    ['open', 'reviewing', 'pending', 'scheduled'].includes(normalized) ? 'warning' :
    ['suspended', 'banned', 'failed', 'degraded'].includes(normalized) ? 'danger' : 'neutral';
  return <span className={`status-badge status-${tone}`}>{value.replaceAll('_', ' ')}</span>;
}
