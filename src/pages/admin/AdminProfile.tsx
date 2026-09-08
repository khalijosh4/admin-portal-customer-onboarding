import { FormEvent, useEffect, useState } from 'react';
import { getOnboardingUser, getProfile, updateProfile, changePassword } from '../../api/onboarding';

export default function AdminProfile() {
  const me = getOnboardingUser();
  const initialName = me?.fullName || '';
  const initialEmail = me?.email || '';

  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfile();
        setFullName(profile.fullName || '');
        setEmail(profile.email || '');
        setPhone(profile.phone || '');
        setError('');
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || err?.message || 'Could not load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved('');
    try {
      await updateProfile({ fullName, email, phone: phone || undefined });
      setSaved('Profile updated.');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not update profile');
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setPwBusy(true);
    try {
      const data = await changePassword(currentPassword, newPassword);
      localStorage.setItem('onboarding_admin_user', JSON.stringify(data.admin));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setSaved('Password changed.');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not change password');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-fortune-ink">My profile</h1>

      {error && <p className="rounded-lg bg-fortune-terracotta/10 p-3 text-sm text-fortune-terracotta">{error}</p>}
      {saved && <p className="rounded-lg bg-fortune-greenLight p-3 text-sm text-fortune-greenDark">{saved}</p>}

      <form onSubmit={saveProfile} className="card">
        <h2 className="mb-4 font-semibold text-fortune-ink">Account details</h2>
        {loading ? (
          <p className="text-fortune-ink/60">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Full name</label>
                <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
              </div>
              <div>
                <label className="field-label">Role</label>
                <input className="field-input" value={me?.role || ''} disabled />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary">Save changes</button>
            </div>
          </div>
        )}
      </form>

      <form onSubmit={onChangePassword} className="card">
        <h2 className="mb-4 font-semibold text-fortune-ink">Change password</h2>
        <div className="space-y-4">
          <div>
            <label className="field-label">Current password</label>
            <input className="field-input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">New password (min 8 chars)</label>
              <input className="field-input" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
            </div>
            <div>
              <label className="field-label">Confirm new password</label>
              <input className="field-input" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={pwBusy}>{pwBusy ? 'Changing…' : 'Change password'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}