import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login, getOnboardingToken, persistOnboardingSession } from '../../api/onboarding';
import logo from '../../assets/logo.webp';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (getOnboardingToken()) return <Navigate to="/admin" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await login(email, password);
      persistOnboardingSession(data.accessToken, data.admin);
      if (data.admin?.mustChangePassword) {
        navigate('/force-password-change');
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-fortune-ink px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src={logo} alt="Fortune Sacco" className="mx-auto mb-3 h-[200px] w-[200px] object-contain" />
          <h1 className="font-display text-xl font-semibold text-fortune-ink">Fortune Sacco Admin</h1>
          <p className="text-sm text-fortune-ink/50">Application review portal</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">Email</label>
            <input className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}