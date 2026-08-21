import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  Bell,
  Database,
  Gauge,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  ServerCog,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Gauge;
  end?: boolean;
};

const nav: NavItem[] = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/users', label: 'User 360', icon: Users },
  { to: '/moderation', label: 'Moderation', icon: ShieldAlert },
  { to: '/verification', label: 'Verification', icon: BadgeCheck },
  { to: '/support', label: 'Operations', icon: LifeBuoy },
  { to: '/rules', label: 'Runtime Policy', icon: SlidersHorizontal },
  { to: '/experience', label: 'Product Experience', icon: Sparkles },
  { to: '/api-mgmt', label: 'Integrations', icon: ServerCog },
  { to: '/db-ops', label: 'Audit & Data', icon: Database },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

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
      {open ? <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`admin-sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">SB</div>
          <div>
            <div className="brand-name">SkillBridge</div>
            <div className="brand-subtitle">Control Plane</div>
          </div>
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>

        <div className="environment-chip"><span className="environment-dot" /> Production-ready workspace</div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              end={end}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-health"><Activity size={16} /><span>API monitoring enabled</span></div>
          <button className="sidebar-logout" onClick={logout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <form onSubmit={search} className="global-search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users, usernames or university…" />
            <kbd>Enter</kbd>
          </form>
          <div className="topbar-actions">
            <button className="icon-action" aria-label="Notifications"><Bell size={19} /></button>
            <div className="operator-pill"><span className="operator-avatar">A</span><span className="operator-copy"><b>Operator</b><small>Moderator / Admin</small></span></div>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
