import { useEffect, useState } from 'react';
import { Users, UserCheck, Calendar, Radio, Share2, TrendingUp, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState } from '../components/States';
import { TrendAreaChart, FunnelVisualizer } from '../components/AdminCharts';

interface AnalyticsData {
  timeframe: string;
  users: {
    total: number;
    newToday: number;
    newPeriod: number;
    dau: number;
    wau: number;
    mau: number;
    trend: Array<{ date: string; users: number }>;
  };
  onboarding: {
    started: number;
    completed: number;
    deferred: number;
    notStarted: number;
    completionRate: number;
    completionDistribution: Record<string, number>;
  };
  rooms: {
    total: number;
    active: number;
    memberships: number;
  };
  sessions: {
    scheduled: number;
    completed: number;
    cancelled: number;
    attendanceRate: number;
  };
  connections: {
    requests: number;
    accepted: number;
    acceptanceRate: number;
  };
  funnel: Array<{ step: string; count: number; conversion: number }>;
}

export default function Analytics() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AnalyticsData>(`/admin/analytics?timeframe=${timeframe}`);
      setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [timeframe]);

  return (
    <div>
      <PageHeader
        eyebrow="Platform Intelligence"
        title="Admin Analytics"
        description="Comprehensive live operational metrics, user activity rhythms, and funnel progression derived directly from database records."
        actions={
          <div className="flex gap-1 bg-slate-200/70 p-1 rounded-xl">
            {(['7d', '30d', '90d'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  timeframe === tf ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <LoadingState label="Computing analytics from database…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="stats-grid">
            <StatCard
              label="Total Users"
              value={data.users.total.toLocaleString()}
              detail={`+${data.users.newPeriod} in selected period`}
              icon={Users}
              tone="blue"
            />
            <StatCard
              label="Active DAU / MAU"
              value={`${data.users.dau} / ${data.users.mau}`}
              detail={`WAU: ${data.users.wau} active this week`}
              icon={UserCheck}
              tone="green"
            />
            <StatCard
              label="Onboarding Rate"
              value={`${data.onboarding.completionRate}%`}
              detail={`${data.onboarding.completed} completed setup`}
              icon={CheckCircle2}
              tone="violet"
            />
            <StatCard
              label="Session Attendance"
              value={`${data.sessions.attendanceRate}%`}
              detail={`${data.sessions.completed} completed sessions`}
              icon={Calendar}
              tone="amber"
            />
          </div>

          {/* User Growth & Onboarding Funnel */}
          <div className="dashboard-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-600" /> User Growth Trend
                  </h2>
                  <p className="panel-subtitle">Historical growth across the last {timeframe}</p>
                </div>
              </div>
              <div className="panel-body">
                <TrendAreaChart data={data.users.trend} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Onboarding & Engagement Funnel</h2>
                  <p className="panel-subtitle">Progression from account creation to first session</p>
                </div>
              </div>
              <div className="panel-body">
                <FunnelVisualizer steps={data.funnel} />
              </div>
            </div>
          </div>

          {/* Operational Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Profile Completion */}
            <div className="panel p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Profile Completion</h3>
              <p className="text-xs text-slate-500 mb-4">Distribution of user profile fullness percent</p>
              <div className="space-y-2">
                {Object.entries(data.onboarding.completionDistribution).map(([bracket, count]) => (
                  <div key={bracket} className="flex justify-between items-center text-xs">
                    <span className="text-slate-600">{bracket}</span>
                    <span className="font-semibold text-slate-800 font-mono">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Learning Rooms */}
            <div className="panel p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Radio size={16} className="text-blue-500" /> Learning Rooms
              </h3>
              <p className="text-xs text-slate-500 mb-4">Spaces created and active memberships</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Rooms:</span>
                  <span className="font-semibold">{data.rooms.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Active Rooms:</span>
                  <span className="font-semibold text-green-600">{data.rooms.active}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Memberships:</span>
                  <span className="font-semibold">{data.rooms.memberships}</span>
                </div>
              </div>
            </div>

            {/* Connections */}
            <div className="panel p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Share2 size={16} className="text-purple-500" /> Peer Connections
              </h3>
              <p className="text-xs text-slate-500 mb-4">Connection requests and acceptance velocity</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Requests in Period:</span>
                  <span className="font-semibold">{data.connections.requests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Accepted Requests:</span>
                  <span className="font-semibold text-purple-600">{data.connections.accepted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Acceptance Rate:</span>
                  <span className="font-semibold">{data.connections.acceptanceRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
