import { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchAllApplications } from '../../api/client';
import { listNotificationTemplates, sendCustomerNotification } from '../../api/onboarding';
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
      const [apps, templatesRes] = await Promise.allSettled([
        fetchAllApplications(),
        listNotificationTemplates(),
      ]);
      if (apps.status === 'fulfilled') {
        setApplications(apps.value);
        if (!selectedApp && apps.value.length) setSelectedApp(apps.value[0].applicationId || String(apps.value[0].id));
      }
      if (templatesRes.status === 'fulfilled') setTemplates(templatesRes.value);
      const failed = [apps, templatesRes].filter((r) => r.status === 'rejected');
      if (failed.length) {
        const first = failed[0] as PromiseRejectedResult;
        const msg = (first.reason as any)?.response?.data?.error?.message || (first.reason as any)?.message || 'Could not load some data';
        setError(`Could not load everything: ${msg}. Members from the applications list are still shown below.`);
      }
    } catch {
      // silent; errors surface on send
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
    </div>
  );
}