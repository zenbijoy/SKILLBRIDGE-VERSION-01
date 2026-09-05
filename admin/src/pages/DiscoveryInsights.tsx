import { useEffect, useState } from 'react';
import { Search, Compass, Share2, HelpCircle, TrendingUp, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState } from '../components/States';

export default function DiscoveryInsights() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/discovery-insights');
      setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load discovery insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Search & Recommendation"
        title="Discovery Insights"
        description="Analyze query accuracy, zero-result search terms, peer connection acceptance, and trending academic research topics across campuses."
      />

      {loading ? (
        <LoadingState label="Analyzing discovery telemetry…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="stats-grid">
            <StatCard
              label="Search Success Rate"
              value={`${data.metrics.searchSuccessRate}%`}
              detail="Queries returning >=1 result"
              icon={Search}
              tone="green"
            />
            <StatCard
              label="Connection Acceptance"
              value={`${data.metrics.connectionAcceptanceRate}%`}
              detail="Peer connection success rate"
              icon={Share2}
              tone="blue"
            />
            <StatCard
              label="Avg Room Density"
              value={`${data.metrics.roomAvgMembers}`}
              detail="Members per learning space"
              icon={Compass}
              tone="violet"
            />
            <StatCard
              label="Tracked Searches"
              value={data.metrics.totalDiscoveryQueries.toLocaleString()}
              detail="Anonymized queries analyzed"
              icon={TrendingUp}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Searches */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-600" /> High-Velocity Search Queries
                </h2>
                <span className="text-xs text-slate-500">Most frequent terms</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Query String</th>
                      <th>Frequency</th>
                      <th>Results Yielded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSearches.map((s: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <strong className="text-slate-800 text-xs font-mono">{s.query}</strong>
                        </td>
                        <td>
                          <span className="text-xs text-slate-600">{s.count} searches</span>
                        </td>
                        <td>
                          <span className="badge badge-success text-[10px]">{s.resultCount} items</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Zero Result Searches */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title flex items-center gap-2">
                  <HelpCircle size={16} className="text-amber-600" /> Zero-Result Searches (Content Gaps)
                </h2>
                <span className="text-xs text-slate-500">Unmet student demand</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Missed Query</th>
                      <th>Attempts</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.zeroResultSearches.map((z: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <strong className="text-slate-800 text-xs font-mono">{z.query}</strong>
                        </td>
                        <td>
                          <span className="text-xs text-amber-700 font-semibold">{z.count} missed</span>
                        </td>
                        <td>
                          <span className="text-[11px] text-slate-500">Create seed skill / study room</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Popular Research Trends */}
          <div className="panel p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" /> Trending Research Interests
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Academic topics cited by student and faculty profiles across participating universities
            </p>
            <div className="flex flex-wrap gap-2">
              {data.popularResearch.map((r: any, i: number) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 border border-slate-200 text-slate-800 font-medium flex items-center gap-2"
                >
                  {r.topic}
                  <span className="text-[10px] font-mono bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full">
                    {r.count} scholars
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
