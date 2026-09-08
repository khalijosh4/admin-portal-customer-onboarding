import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completePasswordChange } from '../../api/onboarding';
import logo from '../../assets/logo.webp';

export default function ForcePasswordChange() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const data = await completePasswordChange(newPassword);
      localStorage.setItem('onboarding_admin_user', JSON.stringify(data.admin));
      navigate('/admin');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-fortune-ink px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src={logo} alt="Fortune Sacco" className="mx-auto mb-3 h-[200px] w-[200px] object-contain" />
          <h1 className="font-display text-xl font-semibold text-fortune-ink">Set a new password</h1>
          <p className="text-sm text-fortune-ink/50">Your password was reset by an administrator. Set a new one to continue.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">New password (min 8 chars)</label>
            <input className="field-input" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
          </div>
          <div>
            <label className="field-label">Confirm password</label>
            <input className="field-input" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      </form>
    </div>
  );
}