import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchApplication, getApiErrorMessage, submitToCore } from '../../api/client';
import { CbsApplication, statusLabel } from '../../types';
import { buildDocImages, DocImage } from '../../utils/images';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-fortune-gold/15 text-fortune-goldDark',
  SUBMITTED: 'bg-fortune-blueLight text-fortune-blueDark',
  UNDER_REVIEW: 'bg-fortune-gold/15 text-fortune-goldDark',
  APPROVED: 'bg-fortune-greenLight text-fortune-greenDark',
  REJECTED: 'bg-fortune-terracotta/10 text-fortune-terracotta',
};

function Badge({ ok, label }: { ok?: boolean | number | null; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        ok ? 'bg-fortune-greenLight text-fortune-greenDark' : 'bg-fortune-terracotta/10 text-fortune-terracotta'
      }`}
    >
      {ok ? '✓' : '✕'} {label}
    </span>
  );
}

export default function AdminApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<CbsApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<DocImage | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    setApp(await fetchApplication(id as string));
  };

  const approveAndPush = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const result = await submitToCore(id as string);
      if (result.outcome === 'success') {
        setMessage({
          kind: 'ok',
          text: `Submitted to the core successfully${result.coreReference ? ` · core ref: ${result.coreReference}` : ''}.`,
        });
      } else if (result.outcome === 'submitted') {
        setMessage({
          kind: 'info',
          text: `Application is now in the core workflow (${result.rawStatus || 'PROCESSING'}).${result.message ? ` ${result.message}` : ''}`,
        });
      } else {
        setMessage({
          kind: 'err',
          text: `Could not submit to the core: ${result.reason || result.message || 'Unknown reason'}`,
        });
      }
    } catch (err: any) {
      setMessage({ kind: 'err', text: getApiErrorMessage(err, 'Could not submit the application to the core') });
    } finally {
      setBusy(false);
      load();
    }
  };

  if (!app) return <p className="text-fortune-ink/60">Loading…</p>;

  const name = `${app.salutation ? `${app.salutation} ` : ''}${app.firstName || ''} ${app.middleName ? `${app.middleName} ` : ''}${app.lastName || ''}`.trim();
  const status = (app.status || '').toUpperCase();
  const canSubmit = status === 'DRAFT' || status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'APPROVED';

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/admin')} className="text-sm font-semibold text-fortune-green">
        ← Back to applications
      </button>

      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fortune-ink">{name || 'Unnamed applicant'}</h1>
            <p className="text-sm text-fortune-ink/50">
              {[app.appRef, app.applicationId].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[status] || 'bg-fortune-ink/10 text-fortune-ink'
              }`}
            >
              {statusLabel(app.status)}
            </span>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Badge ok={app.iprsVerified} label="IPRS verified" />
          <Badge ok={app.internetBanking} label="Internet banking" />
          <Badge ok={app.mobileBanking} label="Mobile banking" />
          <Badge ok={app.paybill} label="Paybill" />
          <Badge ok={app.standingOrderEnabled} label="Standing order" />
          <Badge ok={app.paymentAmount && app.paymentAmount > 0} label="Payment received" />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section title="Personal">
            <Row label="Phone" value={app.phoneNumber} />
            <Row label="Email" value={app.email} />
            <Row label="Gender" value={app.gender} />
            <Row label="Date of birth" value={app.dateOfBirth} />
            <Row label="Marital status" value={labelValue(app.maritalStatus)} />
            <Row label="ID number" value={app.idNumber} />
            <Row label="M-PESA receipt" value={app.mpesaReceiptNumber} />
            <Row label="Payment amount (KES)" value={fmtAmount(app.paymentAmount)} />
            <Row label="Nearest branch" value={labelValue(app.nearestBranch)} />
          </Section>

          <Section title="Employment & referral">
            <Row label="Employment status" value={app.employmentStatus} />
            <Row label="Employer / business" value={app.employerName} />
            <Row label="Work address" value={app.workAddress} />
            <Row label="Referred by staff" value={app.referralStaffNo ? `${app.referralName} (${app.referralStaffNo})` : 'No'} />
            <Row label="Nominee" value={app.nomineeName ? `${app.nomineeName} — ${app.nomineeRelationship}` : ''} />
          </Section>

          <Section title="Accounts & services">
            <Row label="Internet banking" value={yesNo(app.internetBanking)} />
            <Row label="Mobile banking" value={yesNo(app.mobileBanking)} />
            <Row label="Paybill" value={yesNo(app.paybill)} />
            <Row label="Paybill number" value={app.paybillNumber} />
            <Row label="Paybill business" value={app.paybillBusinessName} />
            <Row label="Paybill alert phone" value={app.paybillAlertPhone || app.paybillAlertPhone2} />
            <Row label="Standing order" value={yesNo(app.standingOrderEnabled)} />
            <Row label="Standing order amount (KES)" value={fmtAmount(app.standingOrderAmount)} />
            <Row label="Frequency" value={app.standingOrderFrequency} />
          </Section>

          <Section title="Address">
            <Row label="Line 1" value={app.addressLine1} />
            <Row label="Line 2" value={app.addressLine2} />
            <Row label="Line 3" value={app.addressLine3} />
            <Row label="Line 4" value={app.addressLine4} />
            <Row label="City / Town" value={app.city} />
            <Row label="State" value={app.state} />
            <Row label="District" value={app.district} />
            <Row label="Country" value={app.country} />
          </Section>
        </div>

        <div className="mb-6 border-t border-fortune-ink/10 pt-4">
          <h3 className="mb-3 font-semibold text-fortune-ink">Documents</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {buildDocImages(app as any).map((doc) =>
              doc.dataUrl ? (
                <button key={doc.key} onClick={() => setLightbox(doc)} className="group text-left">
                  <img
                    src={doc.dataUrl}
                    alt={doc.label}
                    className="h-32 w-full rounded-lg border border-fortune-ink/10 object-cover transition group-hover:ring-2 group-hover:ring-fortune-green"
                  />
                  <p className="mt-1 text-center text-xs font-medium capitalize text-fortune-ink/60 group-hover:text-fortune-green">
                    {doc.label}
                  </p>
                </button>
              ) : (
                <div key={doc.key}>
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-fortune-ink/20 bg-fortune-ink/5 text-fortune-ink/30">
                    No image
                  </div>
                  <p className="mt-1 text-center text-xs text-fortune-ink/40">{doc.label}</p>
                </div>
              ),
            )}
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 rounded-lg p-3 text-sm ${
              message.kind === 'ok'
                ? 'bg-fortune-greenLight text-fortune-greenDark'
                : message.kind === 'err'
                  ? 'bg-fortune-terracotta/10 text-fortune-terracotta'
                  : 'bg-fortune-gold/15 text-fortune-goldDark'
            }`}
          >
            {message.text}
          </p>
        )}

        {canSubmit && (
          <div className="mt-8 flex flex-wrap gap-3 border-t border-fortune-ink/10 pt-6">
            <button className="btn-primary" disabled={busy} onClick={approveAndPush}>
              {busy ? 'Submitting…' : 'Approve & submit to core'}
            </button>
            {message?.kind === 'err' && message.text.includes('INTERNAL_ERROR') && (
              <button className="btn-secondary" disabled={busy} onClick={approveAndPush}>
                {busy ? 'Retrying…' : 'Retry submission'}
              </button>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-fortune-ink shadow-lg"
            >
              ×
            </button>
            <img
              src={lightbox.dataUrl!}
              alt={lightbox.label}
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
            />
            <p className="mt-2 text-center text-sm font-medium text-white">{lightbox.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function labelValue(v?: unknown): string {
  if (v === undefined || v === null) return '';
  if (v === 'S') return 'Single';
  if (v === 'M') return 'Married';
  if (v === 'D') return 'Divorced';
  if (v === 'W') return 'Widowed';
  return String(v);
}

function yesNo(v?: boolean | null): string {
  return v ? 'Yes' : 'No';
}

function fmtAmount(v?: number | string | null): string {
  if (v === undefined || v === null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold text-fortune-ink">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-fortune-ink/50">{label}</span>
      <span className="font-medium text-fortune-ink">{value || '—'}</span>
    </div>
  );
}