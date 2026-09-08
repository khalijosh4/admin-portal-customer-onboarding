import { FormEvent, useEffect, useState } from 'react';
import { getOnboardingUser, listUsers, createUser, resetPassword, setUserActive } from '../../api/onboarding';

export default function AdminUsers() {
  const me = getOnboardingUser();
  const isSuperAdmin = me?.role === 'super_admin';

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('reviewer');
  const [busy, setBusy] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPasswordField, setResetPasswordField] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createUser({ email, phone: phone || undefined, fullName, password, role });
      setMessage(`User ${fullName} created. They must change their password on first login.`);
      setShowCreate(false);
      setEmail(''); setPhone(''); setFullName(''); setPassword(''); setRole('reviewer');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Could not create user');
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!resetTarget) return;
    setResetBusy(true);
    setError('');
    try {
      await resetPassword(resetTarget.id, resetPasswordField);
      setMessage(`Password reset for ${resetTarget.fullName || resetTarget.email}. They must change it on next login.`);
      setResetTarget(null);
      setResetPasswordField('');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not reset password');
    } finally {
      setResetBusy(false);
    }
  };

  const onToggleActive = async (u: any) => {
    setError('');
    try {
      await setUserActive(u.id, !u.active);
      setMessage(u.active ? `Deactivated ${u.email}` : `Activated ${u.email}`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not update user');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-fortune-ink">Admin users</h1>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => { setShowCreate((v) => !v); setError(''); }}>
            + New user
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-fortune-terracotta/10 p-3 text-sm text-fortune-terracotta">{error}</p>}
      {message && <p className="mb-4 rounded-lg bg-fortune-greenLight p-3 text-sm text-fortune-greenDark">{message}</p>}

      {showCreate && (
        <form onSubmit={onCreate} className="card mb-6">
          <h2 className="mb-4 font-semibold text-fortune-ink">Create admin user</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Full name</label>
                <input className="field-input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Phone (for SMS notifications)</label>
                <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
              </div>
              <div>
                <label className="field-label">Role</label>
                <select className="field-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="reviewer">Reviewer</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Temporary password (min 8 chars)</label>
                <input className="field-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-fortune-ink/60">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-fortune-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-fortune-ink/5 text-xs uppercase tracking-wide text-fortune-ink/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-fortune-ink/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-fortune-ink">{u.fullName}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{u.phone || '—'}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${u.active ? 'bg-fortune-greenLight text-fortune-greenDark' : 'bg-fortune-ink/10 text-fortune-ink/60'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button className="text-xs font-semibold text-fortune-green" onClick={() => { setResetTarget(u); setResetPasswordField(''); }}>Reset password</button>
                        <button className={`text-xs font-semibold ${u.active ? 'text-fortune-terracotta' : 'text-fortune-green'}`} onClick={() => onToggleActive(u)}>
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold text-fortune-ink">Reset password for {resetTarget.email}</h3>
            <label className="field-label">New temporary password (min 8 chars)</label>
            <input className="field-input" type="password" value={resetPasswordField} onChange={(e) => setResetPasswordField(e.target.value)} minLength={8} />
            <div className="mt-4 flex gap-3">
              <button className="btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button>
              <button className="btn-primary" disabled={resetBusy || resetPasswordField.length < 8} onClick={onReset}>
                {resetBusy ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}