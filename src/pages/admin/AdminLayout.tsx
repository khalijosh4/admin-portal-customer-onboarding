import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearOnboardingSession, getOnboardingUser, getOnboardingToken, listNotifications, unreadNotificationCount, markAllNotificationsRead } from '../../api/onboarding';
import logo from '../../assets/logo.webp';

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const [list, count] = await Promise.all([listNotifications(20), unreadNotificationCount()]);
      setItems(list);
      setUnread(count);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markAll = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    load();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="relative rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-fortune-gold px-1 text-[10px] font-bold text-fortune-ink">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-fortune-ink/10 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-fortune-ink/10 px-4 py-3">
            <p className="font-semibold text-fortune-ink">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-semibold text-fortune-green" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-fortune-ink/5 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-fortune-ink/50">No notifications yet.</p>
            )}
            {items.map((n) => (
              <div key={n.id} className={`px-4 py-3 ${n.readAt ? '' : 'bg-fortune-greenLight/40'}`}>
                <p className="text-sm font-semibold text-fortune-ink">{n.title}</p>
                <p className="mt-0.5 text-sm text-fortune-ink/70">{n.body}</p>
                <p className="mt-1 text-xs text-fortune-ink/40">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const token = getOnboardingToken();
  const admin = getOnboardingUser();
  const name = admin?.fullName || admin?.email || '';

  const logout = () => {
    clearOnboardingSession();
    navigate('/login');
  };

  useEffect(() => {
    if (!token) navigate('/login');
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;

  if (admin?.mustChangePassword) {
    return <Navigate to="/force-password-change" replace />;
  }

  return (
    <div className="min-h-screen bg-fortune-cream">
      <header className="bg-gradient-to-r from-fortune-blue via-fortune-blueDark to-fortune-green">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/admin" className="flex items-center gap-3">
            <img src={logo} alt="Fortune Sacco" className="h-[140px] w-[140px] shrink-0 object-contain" />
            <div>
              <p className="font-display font-semibold leading-tight text-white">Fortune Sacco Admin</p>
              <p className="text-xs text-white/75">Your Success, Our Success · Review portal</p>
            </div>
          </Link>
          <nav className="ml-10 hidden items-center gap-6 md:flex">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-white underline underline-offset-4' : 'text-white/75 hover:text-white'}`
              }
            >
              Applications
            </NavLink>
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-white underline underline-offset-4' : 'text-white/75 hover:text-white'}`
              }
            >
              Users
            </NavLink>
            <NavLink
              to="/admin/notifications"
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-white underline underline-offset-4' : 'text-white/75 hover:text-white'}`
              }
            >
              Notifications
            </NavLink>
            <NavLink
              to="/admin/profile"
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-white underline underline-offset-4' : 'text-white/75 hover:text-white'}`
              }
            >
              Profile
            </NavLink>
          </nav>
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <Link to="/admin/profile" className="hidden text-sm text-white/80 hover:text-white sm:inline">
              {name}
            </Link>
            <button onClick={logout} className="text-sm font-semibold text-white underline-offset-2 hover:underline">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}