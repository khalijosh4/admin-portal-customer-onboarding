import { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchAllApplications } from '../../api/client';
import { listNotificationTemplates, sendCustomerNotification, listNotifications } from '../../api/onboarding';
import { CbsApplication } from '../../types';

interface Template {
  id: string;
  name: string;
  description: string;
  channel: 'sms' | 'email' | 'both';
  subject?: string;
  body: string;
}

export default function AdminNotifications() {
  const [applications, setApplications] = useState<CbsApplication[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sentLog, setSentLog] = useState<any[]>([]);

  // Selection
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [channel, setChannel] = useState<'sms' | 'email' | 'both'>('sms');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Result / busy
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [apps, templatesRes, log] = await Promise.all([
        fetchAllApplications(),
        listNotificationTemplates(),
        listNotifications(50),
      ]);
      setApplications(apps);
      setTemplates(templatesRes);
      if (!selectedApp && apps.length) setSelectedApp(apps[0].applicationId || String(apps[0].id));
      if (Array.isArray(log)) setSentLog(log);
    } catch {
      // silent for log; errors surface on send
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => applications.find((a) => (a.applicationId || String(a.id)) === selectedApp),
    [applications, selectedApp],
  );

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (t.channel === 'both') setChannel('both');
    else if (t.channel === 'email' || t.channel === 'sms') setChannel(t.channel);
    setSubject(t.subject || '');
    const firstName = selected?.firstName || 'Member';
    const reference = selected?.appRef || selected?.applicationId || '';
    setBody(t.body.replace(/\{firstName\}/g, firstName).replace(/\{reference\}/g, reference));
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const recipientPhone = selected?.phoneNumber;
      const recipientEmail = selected?.email;
      const result = await sendCustomerNotification({
        applicationId: selected?.applicationId || undefined,
        phoneNumber: recipientPhone,
        email: recipientEmail,
        channel,
        subject: subject || undefined,
        body,
        templateId: templateId || undefined,
      });
      const parts: string[] = [];
      if ('sms' === channel || 'both' === channel) parts.push(`SMS: ${result.smsSent ? 'sent' : 'failed (dev mode logs it)'}`);
      if ('email' === channel || 'both' === channel) parts.push(`Email: ${result.emailSent ? 'sent' : 'failed (dev mode logs it)'}`);
      setMessage(`Notification sent → ${parts.join(' · ')}`);
      setSentLog(await listNotifications(50));
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Could not send notification');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-fortune-ink">Notifications</h1>

      {error && <p className="rounded-lg bg-fortune-terracotta/10 p-3 text-sm text-fortune-terracotta">{error}</p>}
      {message && <p className="rounded-lg bg-fortune-greenLight p-3 text-sm text-fortune-greenDark">{message}</p>}

      <form onSubmit={send} className="card">
        <h2 className="mb-4 font-semibold text-fortune-ink">Send a notification to a member</h2>

        <div className="space-y-4">
          <div>
            <label className="field-label">Member</label>
            <select className="field-input" value={selectedApp} onChange={(e) => { setSelectedApp(e.target.value); setTemplateId(''); }}>
              <option value="">— Select a member —</option>
              {applications.map((a) => (
                <option key={a.applicationId || a.id} value={a.applicationId || String(a.id)}>
                  {a.firstName} {a.lastName} — {a.appRef || a.applicationId} ({a.phoneNumber})
                </option>
              ))}
            </select>
            {selected && (
              <p className="mt-1 text-xs text-fortune-ink/50">
                Phone: {selected.phoneNumber || '—'} · Email: {selected.email || '—'}
              </p>
            )}
          </div>

          <div>
            <label className="field-label">Channel</label>
            <div className="flex flex-wrap gap-2">
              {(['sms', 'email', 'both'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${channel === c ? 'bg-fortune-green text-white' : 'bg-white text-fortune-ink/60 hover:bg-fortune-greenLight'}`}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label">Use template</label>
            <select className="field-input" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— Freeform message —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {(channel === 'email' || channel === 'both') && (
            <div>
              <label className="field-label">Subject</label>
              <input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
            </div>
          )}

          <div>
            <label className="field-label">Message</label>
            <textarea className="field-input" rows={4} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" />
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy || !selected}>{busy ? 'Sending…' : 'Send notification'}</button>
          </div>
        </div>
      </form>

      <div className="card">
        <h2 className="mb-4 font-semibold text-fortune-ink">Recent notifications</h2>
        {sentLog.length === 0 ? (
          <p className="text-fortune-ink/60">No notifications sent yet.</p>
        ) : (
          <div className="space-y-3">
            {sentLog.slice(0, 20).map((n) => (
              <div key={n.id} className="rounded-lg border border-fortune-ink/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-fortune-ink">{n.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${n.audience === 'admin' ? 'bg-fortune-blueLight text-fortune-blueDark' : 'bg-fortune-gold/15 text-fortune-goldDark'}`}>
                    {n.audience === 'admin' ? 'Admin' : 'Customer'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-fortune-ink/70">{n.body}</p>
                <p className="mt-1 text-xs text-fortune-ink/40">
                  {n.channel} · {n.recipient || 'in-app'} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}