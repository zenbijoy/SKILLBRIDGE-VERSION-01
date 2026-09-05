import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Compass,
  Database,
  Flag,
  Gauge,
  LifeBuoy,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Search,
  Send,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Gauge;
  end?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navigationSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Overview', icon: Gauge, end: true },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/system-status', label: 'System Health', icon: Activity },
      { to: '/alerts', label: 'Admin Alerts', icon: Bell },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/users', label: 'User 360', icon: Users },
      { to: '/administrators', label: 'Administrators', icon: ShieldAlert },
      { to: '/verification', label: 'Verification', icon: BadgeCheck },
      { to: '/privacy', label: 'Privacy & Accounts', icon: Lock },
    ],
  },
  {
    title: 'Learning',
    items: [
      { to: '/skills-intelligence', label: 'Skills Intelligence', icon: Compass },
      { to: '/learning-ops', label: 'Learning Operations', icon: Radio },
      { to: '/discovery-insights', label: 'Discovery Insights', icon: Search },
    ],
  },
  {
    title: 'Trust & Support',
    items: [
      { to: '/trust-cases', label: 'Trust & Safety Cases', icon: ShieldCheck },
      { to: '/moderation', label: 'Moderation', icon: Flag },
      { to: '/support', label: 'Support & Tickets', icon: LifeBuoy },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { to: '/community', label: 'Community Ops', icon: MessageSquare },
      { to: '/campaigns', label: 'Campaign Center', icon: Send },
      { to: '/experience', label: 'Product Experience', icon: Sparkles },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/data-quality', label: 'Data Quality', icon: AlertTriangle },
      { to: '/rules', label: 'Runtime Policy', icon: SlidersHorizontal },
      { to: '/api-mgmt', label: 'Integrations', icon: ServerCog },
      { to: '/db-ops', label: 'Audit Explorer V2', icon: Database },
    ],
  },
];

type AlertPreview = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState<AlertPreview[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fetchAlerts = async () => {
      try {
        const res = await api.get<{ alerts: AlertPreview[] }>('/admin/alerts');
        if (mounted && res.data?.alerts) {
          setUnreadAlerts(res.data.alerts);
        }
      } catch {
        // Quiet fail for alerts polling
      }
    };

    void fetchAlerts();
    const interval = setInterval(fetchAlerts, 45_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/users?q=${encodeURIComponent(q)}` : '/users');
    setOpen(false);
  };

  return (
    <div className="admin-shell">
      {open ? (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside className={`admin-sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">SB</div>
          <div>
            <div className="brand-name">SkillBridge</div>
            <div className="brand-subtitle">Control Plane V4</div>
          </div>
          <button
            className="sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="environment-chip">
          <span className="environment-dot" /> Production-ready workspace
        </div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navigationSections.map((section) => (
            <div key={section.title} className="mb-2">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  end={end}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                  }
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-health">
            <Activity size={16} />
            <span>Operational Console Active</span>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="mobile-menu"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <form onSubmit={search} className="global-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users, universities, rooms or audit logs…"
            />
            <kbd>Enter</kbd>
          </form>

          <div className="topbar-actions relative">
            <button
              className="icon-action relative"
              aria-label="Notifications"
              onClick={() => setAlertsOpen(!alertsOpen)}
            >
              <Bell size={19} />
              {unreadAlerts.length > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow">
                  {unreadAlerts.length > 9 ? '9+' : unreadAlerts.length}
                </span>
              ) : null}
            </button>

            {/* Alerts Dropdown Modal */}
            {alertsOpen ? (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAlertsOpen(false)}
                />
                <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl text-slate-100">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="font-semibold text-xs">
                      Active Operational Alerts ({unreadAlerts.length})
                    </span>
                    <button
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate('/alerts');
                      }}
                      className="text-[11px] text-indigo-400 hover:underline"
                    >
                      View All
                    </button>
                  </div>

                  <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                    {unreadAlerts.length > 0 ? (
                      unreadAlerts.slice(0, 5).map((alert) => (
                        <div
                          key={alert.id}
                          onClick={() => {
                            setAlertsOpen(false);
                            navigate('/alerts');
                          }}
                          className="cursor-pointer rounded-lg bg-slate-800/80 p-2.5 hover:bg-slate-800 transition"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200 truncate max-w-[180px]">
                              {alert.title}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                alert.severity === 'critical'
                                  ? 'bg-red-500/20 text-red-400'
                                  : alert.severity === 'high'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}
                            >
                              {alert.severity}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Category: {alert.category}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-400">
                        No active operational alerts. Subsystems healthy.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            <div className="operator-pill">
              <span className="operator-avatar">A</span>
              <span className="operator-copy">
                <b>Operator</b>
                <small>Moderator / Admin</small>
              </span>
            </div>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
