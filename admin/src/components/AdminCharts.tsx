export interface TrendPoint {
  date: string;
  users: number;
}

export function TrendAreaChart({
  data,
  height = 180,
  strokeColor = '#2563eb',
}: {
  data: TrendPoint[];
  height?: number;
  strokeColor?: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div className="h-44 grid place-items-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
        Not enough historical data points yet
      </div>
    );
  }

  const values = data.map((d) => d.users);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05 || 1;
  const range = max - min || 1;

  const width = 600;
  const padX = 20;
  const padY = 20;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * chartWidth;
    const y = padY + chartHeight - ((d.users - min) / range) * chartHeight;
    return { x, y, date: d.date, value: d.users };
  });

  const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padY + chartHeight * ratio;
          return (
            <line
              key={ratio}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          );
        })}

        {/* Gradient fill */}
        <path d={areaD} fill="url(#areaGradient)" />

        {/* Trend stroke */}
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((pt, i) => (
          <g key={i} className="group cursor-pointer">
            <circle cx={pt.x} cy={pt.y} r="3" fill="#ffffff" stroke={strokeColor} strokeWidth="2" />
            <title>{`${pt.date}: ${pt.value} users`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400 px-2 mt-1">
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function FunnelVisualizer({
  steps,
}: {
  steps: Array<{ step: string; count: number; conversion: number }>;
}) {
  const max = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const pct = Math.max(4, Math.round((s.count / max) * 100));
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">{s.step}</span>
              <span className="text-slate-500 font-mono">
                {s.count.toLocaleString()} ({s.conversion}%)
              </span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, opacity: 1 - i * 0.1 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
