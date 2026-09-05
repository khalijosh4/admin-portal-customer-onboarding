import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getStoredUser, isAuthed } from '../../api/adminAuth';
import logo from '../../assets/logo.webp';

export default function AdminLayout() {
  const navigate = useNavigate();
  const admin = getStoredUser();

  if (!isAuthed()) return <Navigate to="/login" replace />;

  const logout = () => {
    clearSession();
    navigate('/login');
  };

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
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-white/80 sm:inline">{admin?.username ?? ''}</span>
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