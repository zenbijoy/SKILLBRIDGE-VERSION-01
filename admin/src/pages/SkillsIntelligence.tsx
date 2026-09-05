import { useEffect, useState } from 'react';
import { Search, AlertTriangle, Filter, ArrowUpDown } from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';

interface SkillStat {
  id: string;
  name: string;
  category: string;
  learners: number;
  teachers: number;
  researchers: number;
  verifiedTeachers: number;
  demandSupplyRatio: number;
  isShortage: boolean;
}

interface SkillsIntelligenceResponse {
  skills: SkillStat[];
  total: number;
  page: number;
  limit: number;
  insights: {
    criticalShortages: SkillStat[];
    topResearchTopics: SkillStat[];
  };
}

export default function SkillsIntelligence() {
  const [data, setData] = useState<SkillsIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('ratio_desc');
  const [page, setPage] = useState(1);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SkillsIntelligenceResponse>('/admin/skills-intelligence', {
        params: {
          page,
          limit: 15,
          q: search.trim() || undefined,
          category: category !== 'all' ? category : undefined,
          sort,
        },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load skills intelligence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [page, category, sort]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadData();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace Dynamics"
        title="Skills Intelligence"
        description="Monitor peer teaching supply versus learner demand, identify critical skill shortages, and track emerging research interests across universities."
      />

      {/* Critical Shortage Alert Banner */}
      {data?.insights.criticalShortages && data.insights.criticalShortages.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-amber-900">Critical Skill Shortages Detected</h3>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              High learner interest with zero or severely limited peer tutors available:
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.insights.criticalShortages.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-amber-300 text-amber-800 shadow-sm">
                  {s.name} <span className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-900">{s.learners} learners · {s.teachers} tutors</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="panel mb-6 p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-2 w-full md:w-80 relative">
            <Search size={16} className="absolute left-3 text-slate-400" />
            <input
              type="text"
              className="form-input pl-9 w-full text-xs"
              placeholder="Search skill title or domain…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter size={14} /> Category:
            </div>
            <select
              className="form-input text-xs py-1.5"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Domains</option>
              <option value="programming">Programming</option>
              <option value="design">Design & UX</option>
              <option value="data">Data & ML</option>
              <option value="general">General Academic</option>
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2">
              <ArrowUpDown size={14} /> Sort By:
            </div>
            <select
              className="form-input text-xs py-1.5"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="ratio_desc">Demand / Supply Ratio (High to Low)</option>
              <option value="learners_desc">Most Learners</option>
              <option value="teachers_desc">Most Tutors</option>
              <option value="name_asc">Alphabetical (A-Z)</option>
            </select>
          </div>
        </form>
      </div>

      {/* Main Table */}
      {loading ? (
        <LoadingState label="Analyzing skill demand and teacher supply…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : data ? (
        <div className="panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Skill Name</th>
                  <th>Category</th>
                  <th>Learners</th>
                  <th>Tutors</th>
                  <th>Researchers</th>
                  <th>Demand/Supply Ratio</th>
                  <th>Marketplace Status</th>
                </tr>
              </thead>
              <tbody>
                {data.skills.map((skill) => (
                  <tr key={skill.id}>
                    <td>
                      <strong className="text-slate-900 font-semibold">{skill.name}</strong>
                    </td>
                    <td>
                      <span className="text-xs text-slate-500 font-mono capitalize">{skill.category}</span>
                    </td>
                    <td>
                      <span className="font-semibold text-blue-600">{skill.learners}</span>
                    </td>
                    <td>
                      <span className="font-semibold text-emerald-600">{skill.teachers}</span>
                      {skill.verifiedTeachers > 0 && (
                        <span className="text-[10px] text-slate-400 ml-1">({skill.verifiedTeachers} verified)</span>
                      )}
                    </td>
                    <td>
                      <span className="text-xs text-purple-600">{skill.researchers}</span>
                    </td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        skill.demandSupplyRatio >= 4
                          ? 'bg-red-50 text-red-700'
                          : skill.demandSupplyRatio >= 2
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {skill.demandSupplyRatio}x
                      </span>
                    </td>
                    <td>
                      {skill.isShortage ? (
                        <span className="badge badge-danger">Severe Shortage</span>
                      ) : skill.demandSupplyRatio > 2 ? (
                        <span className="badge badge-warning">High Demand</span>
                      ) : (
                        <span className="badge badge-success">Balanced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {data.skills.length} of {data.total} skills</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary py-1 px-3"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3"
                disabled={page * 15 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
