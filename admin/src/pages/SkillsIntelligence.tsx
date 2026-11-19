import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  Compass,
  Download,
  Edit2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingState, ErrorState } from '../components/States';
import { useToast } from '../components/ToastContext';

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

const CATEGORIES = [
  'all',
  'programming',
  'design',
  'data',
  'engineering',
  'mathematics',
  'business',
  'language',
  'general',
];

export default function SkillsIntelligence() {
  const [params] = useSearchParams();
  const { success, error: toastError } = useToast();

  const [data, setData] = useState<SkillsIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('ratio_desc');
  const [page, setPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(params.get('action') === 'create');
  const [editSkill, setEditSkill] = useState<{ id: string; name: string; category: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newSkillForm, setNewSkillForm] = useState({ name: '', category: 'programming' });

  const loadData = useCallback(async () => {
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
  }, [page, search, category, sort]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadData();
  };

  // Add Skill
  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillForm.name.trim()) {
      toastError('Skill name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/skills-intelligence', {
        name: newSkillForm.name.trim(),
        category: newSkillForm.category,
      });
      success(`Skill "${newSkillForm.name.trim()}" added to the global catalog.`);
      setShowAddModal(false);
      setNewSkillForm({ name: '', category: 'programming' });
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to create skill.');
    } finally {
      setSubmitting(false);
    }
  };

  // Update Skill
  const handleUpdateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSkill || !editSkill.name.trim()) return;

    setSubmitting(true);
    try {
      await api.patch(`/admin/skills-intelligence/${editSkill.id}`, {
        name: editSkill.name.trim(),
        category: editSkill.category,
      });
      success(`Skill updated successfully.`);
      setEditSkill(null);
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to update skill.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Skill
  const handleDeleteSkill = async (skill: SkillStat) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${skill.name}"? This removes it from the catalog.`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/admin/skills-intelligence/${skill.id}`);
      success(`Skill "${skill.name}" deleted.`);
      void loadData();
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete skill.');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (!data?.skills.length) return;
    const headers = ['Skill Name', 'Category', 'Learners', 'Tutors', 'Researchers', 'Demand/Supply Ratio', 'Status'];
    const rows = data.skills.map((s) => [
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.category}"`,
      s.learners,
      s.teachers,
      s.researchers,
      s.demandSupplyRatio,
      `"${s.isShortage ? 'Severe Shortage' : s.demandSupplyRatio > 2 ? 'High Demand' : 'Balanced'}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `skillbridge_skills_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    success('Skills catalog exported to CSV.');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace Dynamics"
        title="Skills Intelligence &amp; Catalog Control"
        description="Monitor student learner demand, tutor supply ratios, and manage the platform skills taxonomy."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => void loadData()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="btn-secondary" onClick={handleExportCsv} title="Export current skills view to CSV">
              <Download size={15} /> Export CSV
            </button>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Add Catalog Skill
            </button>
          </div>
        }
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
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-amber-300 text-amber-800 shadow-sm"
                >
                  {s.name}
                  <span className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 font-mono">
                    {s.learners} learners · {s.teachers} tutors
                  </span>
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
              <Filter size={14} /> Domain:
            </div>
            <select
              className="form-input text-xs py-1.5"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Domains' : c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.skills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                      No skills found matching current query. Click &ldquo;Add Catalog Skill&rdquo; to add one.
                    </td>
                  </tr>
                ) : (
                  data.skills.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <strong className="text-slate-900 font-semibold text-xs">{skill.name}</strong>
                      </td>
                      <td>
                        <span className="text-xs text-slate-600 font-mono capitalize px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                          {skill.category}
                        </span>
                      </td>
                      <td>
                        <span className="font-semibold text-blue-600 text-xs font-mono">{skill.learners}</span>
                      </td>
                      <td>
                        <span className="font-semibold text-emerald-600 text-xs font-mono">{skill.teachers}</span>
                        {skill.verifiedTeachers > 0 && (
                          <span className="text-[10px] text-slate-400 ml-1">({skill.verifiedTeachers} verified)</span>
                        )}
                      </td>
                      <td>
                        <span className="text-xs text-purple-600 font-mono">{skill.researchers}</span>
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                            skill.demandSupplyRatio >= 4
                              ? 'bg-red-50 text-red-700'
                              : skill.demandSupplyRatio >= 2
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {skill.demandSupplyRatio}x
                        </span>
                      </td>
                      <td>
                        {skill.isShortage ? (
                          <span className="badge badge-danger text-[10px]">Severe Shortage</span>
                        ) : skill.demandSupplyRatio > 2 ? (
                          <span className="badge badge-warning text-[10px]">High Demand</span>
                        ) : (
                          <span className="badge badge-success text-[10px]">Balanced</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditSkill({ id: skill.id, name: skill.name, category: skill.category })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Edit Skill"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSkill(skill)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete Skill"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {data.skills.length} of {data.total} skills
            </span>
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

      {/* MODAL: ADD CATALOG SKILL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Compass size={18} className="text-blue-600" /> Add New Catalog Skill
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSkill} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Skill Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Next.js 14, Machine Learning, UI/UX"
                  value={newSkillForm.name}
                  onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })}
                  className="field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Domain / Category</label>
                <select
                  value={newSkillForm.category}
                  onChange={(e) => setNewSkillForm({ ...newSkillForm, category: e.target.value })}
                  className="field w-full text-xs capitalize"
                >
                  {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Creating…' : 'Add Skill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SKILL */}
      {editSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-600" /> Edit Catalog Skill
              </h3>
              <button
                onClick={() => setEditSkill(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateSkill} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Skill Name</label>
                <input
                  type="text"
                  required
                  value={editSkill.name}
                  onChange={(e) => setEditSkill({ ...editSkill, name: e.target.value })}
                  className="field w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Domain / Category</label>
                <select
                  value={editSkill.category}
                  onChange={(e) => setEditSkill({ ...editSkill, category: e.target.value })}
                  className="field w-full text-xs capitalize"
                >
                  {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditSkill(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Updating…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
