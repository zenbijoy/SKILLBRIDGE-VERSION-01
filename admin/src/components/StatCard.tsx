import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'violet' | 'red';
}) {
  return (
    <div className="panel stat-card">
      <div className={`stat-icon stat-icon-${tone}`}><Icon size={19} strokeWidth={2.2} /></div>
      <div className="min-w-0">
        <p className="stat-label">{label}</p>
        <p className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {detail ? <p className="stat-detail">{detail}</p> : null}
      </div>
    </div>
  );
}
