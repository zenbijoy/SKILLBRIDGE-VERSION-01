import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Compass,
  Database,
  Flag,
  Gauge,
  Key,
  HardDrive,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

interface PaletteAction {
  id: string;
  title: string;
  description: string;
  category: 'Navigation' | 'Quick Actions';
  icon: typeof Gauge;
  shortcut?: string;
  onSelect: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const actions: PaletteAction[] = useMemo(() => [
    // Quick Actions
    {
      id: 'act-maintenance',
      title: 'Platform Maintenance Mode',
      description: 'Toggle platform maintenance mode and customize user banner',
      category: 'Quick Actions',
      icon: Wrench,
      shortcut: 'M',
      onSelect: () => {
        navigate('/rules');
        onClose();
      },
    },
    {
      id: 'act-api-keys',
      title: 'Manage Provider API Keys',
      description: 'View, add, quota-limit LiveKit, Gemini, YouTube, and Push API keys',
      category: 'Quick Actions',
      icon: Key,
      shortcut: 'K',
      onSelect: () => {
        navigate('/api-mgmt');
        onClose();
      },
    },
    {
      id: 'act-storage-pools',
      title: 'Cloudflare R2 Storage Pools',
      description: 'Configure and test multi-bucket object storage credentials',
      category: 'Quick Actions',
      icon: HardDrive,
      onSelect: () => {
        navigate('/api-mgmt?tab=storage');
        onClose();
      },
    },
    {
      id: 'act-cache-clear',
      title: 'Purge System Redis Cache',
      description: 'Safely invalidate cached dashboards, rooms, and catalog records',
      category: 'Quick Actions',
      icon: Database,
      onSelect: () => {
        navigate('/system-status');
        onClose();
      },
    },
    {
      id: 'act-create-skill',
      title: 'Add New Catalog Skill',
      description: 'Register a new subject or technical skill in the global taxonomy',
      category: 'Quick Actions',
      icon: Compass,
      onSelect: () => {
        navigate('/skills-intelligence?action=create');
        onClose();
      },
    },
    {
      id: 'act-campaign',
      title: 'Create Broadcast Campaign',
      description: 'Draft and dispatch targeted in-app or push announcements',
      category: 'Quick Actions',
      icon: Send,
      onSelect: () => {
        navigate('/campaigns');
        onClose();
      },
    },
    {
      id: 'act-data-repair',
      title: 'Run Data Quality Auto-Repair',
      description: 'Remediate empty orphaned rooms and stale onboarding sessions',
      category: 'Quick Actions',
      icon: AlertTriangle,
      onSelect: () => {
        navigate('/data-quality');
        onClose();
      },
    },

    // Navigation
    {
      id: 'nav-overview',
      title: 'Overview & Control Plane',
      description: 'Executive KPI metrics, active sessions, and privileged audit stream',
      category: 'Navigation',
      icon: Gauge,
      onSelect: () => {
        navigate('/');
        onClose();
      },
    },
    {
      id: 'nav-analytics',
      title: 'Analytics & Funnels',
      description: 'User conversion funnels, retention trends, and campus breakdown',
      category: 'Navigation',
      icon: BarChart3,
      onSelect: () => {
        navigate('/analytics');
        onClose();
      },
    },
    {
      id: 'nav-users',
      title: 'User 360',
      description: 'Search user profiles, manage accounts, reset credentials, export records',
      category: 'Navigation',
      icon: Users,
      onSelect: () => {
        navigate('/users');
        onClose();
      },
    },
    {
      id: 'nav-admins',
      title: 'Administrators & RBAC',
      description: 'Invite control plane administrators and audit privileged roles',
      category: 'Navigation',
      icon: ShieldAlert,
      onSelect: () => {
        navigate('/administrators');
        onClose();
      },
    },
    {
      id: 'nav-skills',
      title: 'Skills Intelligence',
      description: 'Shortage detection, supply/demand ratios, and catalog curation',
      category: 'Navigation',
      icon: Compass,
      onSelect: () => {
        navigate('/skills-intelligence');
        onClose();
      },
    },
    {
      id: 'nav-moderation',
      title: 'Moderation Center',
      description: 'Triage user reports, review content flags, and apply disciplinary actions',
      category: 'Navigation',
      icon: Flag,
      onSelect: () => {
        navigate('/moderation');
        onClose();
      },
    },
    {
      id: 'nav-trust',
      title: 'Trust & Safety Cases',
      description: 'Structured escalation workflows and multi-operator investigations',
      category: 'Navigation',
      icon: ShieldCheck,
      onSelect: () => {
        navigate('/trust-cases');
        onClose();
      },
    },
    {
      id: 'nav-rules',
      title: 'Runtime Policy & Versions',
      description: 'Maintenance mode, rate limiting, and app version enforcement',
      category: 'Navigation',
      icon: SlidersHorizontal,
      onSelect: () => {
        navigate('/rules');
        onClose();
      },
    },
    {
      id: 'nav-community',
      title: 'Community Operations',
      description: 'Manage campus clubs, student events, shared files, and quizzes',
      category: 'Navigation',
      icon: MessageSquare,
      onSelect: () => {
        navigate('/community');
        onClose();
      },
    },
    {
      id: 'nav-system',
      title: 'System Health & Telemetry',
      description: 'Realtime database latency, Redis memory, auth metrics, and service checks',
      category: 'Navigation',
      icon: Activity,
      onSelect: () => {
        navigate('/system-status');
        onClose();
      },
    },
    {
      id: 'nav-alerts',
      title: 'Operational Alerts',
      description: 'Active alarms across security, moderation, and infrastructure',
      category: 'Navigation',
      icon: Bell,
      onSelect: () => {
        navigate('/alerts');
        onClose();
      },
    },
    {
      id: 'nav-audit',
      title: 'Audit Explorer V2',
      description: 'Comprehensive queryable audit log with sanitization and CSV export',
      category: 'Navigation',
      icon: Database,
      onSelect: () => {
        navigate('/db-ops');
        onClose();
      },
    },
    {
      id: 'nav-nextgen',
      title: 'Next-Gen Operations',
      description: 'Live telemetry, recording queues, and anonymous identity reveal',
      category: 'Navigation',
      icon: Zap,
      onSelect: () => {
        navigate('/nextgen');
        onClose();
      },
    },
  ], [navigate, onClose]);

  // Filter items
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].onSelect();
        } else if (query.trim()) {
          navigate(`/users?q=${encodeURIComponent(query.trim())}`);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, query, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl text-slate-100 flex flex-col max-h-[75vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Bar */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3.5">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
            placeholder="Type a command, feature, or user search... (↑↓ to navigate, Enter to select)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Action List */}
        <div className="overflow-y-auto p-2 space-y-1">
          {query.trim().length > 0 && (
            <div
              onClick={() => {
                navigate(`/users?q=${encodeURIComponent(query.trim())}`);
                onClose();
              }}
              className="flex items-center justify-between p-2.5 rounded-xl cursor-pointer hover:bg-indigo-600/20 text-indigo-300 text-xs font-semibold border border-indigo-500/20 mb-2"
            >
              <div className="flex items-center gap-2.5">
                <Users size={16} className="text-indigo-400" />
                <span>Search user records for &ldquo;<strong className="text-white">{query.trim()}</strong>&rdquo;</span>
              </div>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded">Jump</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No matching commands found for &ldquo;{query}&rdquo;. Press Enter to search profiles.
            </div>
          ) : (
            filtered.map((action, idx) => {
              const Icon = action.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={action.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold leading-tight truncate">
                        {action.title}
                      </div>
                      <div
                        className={`text-[11px] truncate mt-0.5 ${
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {action.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-blue-700/60 text-blue-100'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {action.category}
                    </span>
                    {action.shortcut && (
                      <kbd
                        className={`hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {action.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-400 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span><kbd className="bg-slate-800 px-1 rounded text-[10px]">↑↓</kbd> navigate</span>
            <span><kbd className="bg-slate-800 px-1 rounded text-[10px]">↵</kbd> select</span>
          </div>
          <span>SkillBridge Super-Control Plane</span>
        </div>
      </div>
    </div>
  );
}
