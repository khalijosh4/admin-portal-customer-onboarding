import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllApplications, getApiErrorMessage } from '../../api/client';
import { CbsApplication, statusLabel } from '../../types';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-fortune-gold/15 text-fortune-goldDark',
  SUBMITTED: 'bg-fortune-blueLight text-fortune-blueDark',
  UNDER_REVIEW: 'bg-fortune-gold/15 text-fortune-goldDark',
  APPROVED: 'bg-fortune-greenLight text-fortune-greenDark',
  REJECTED: 'bg-fortune-terracotta/10 text-fortune-terracotta',
};

export default function AdminDashboard() {
  const [applications, setApplications] = useState<CbsApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchAllApplications();
      setApplications(data);
      setError('');
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      setApplications([]);
      setError(getApiErrorMessage(err, 'Could not load applications. Please retry.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    applications.forEach((a) => {
      const s = (a.status || '').toUpperCase();
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [applications]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-fortune-ink">Applications for review</h1>
        <button
          className="text-sm font-semibold text-fortune-green disabled:opacity-50"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>
      {lastUpdated && (
        <p className="mb-3 text-xs text-fortune-ink/40">Last updated {lastUpdated} · auto-refreshes every 15s</p>
      )}

      {loading ? (
        <p className="text-fortune-ink/60">Loading…</p>
      ) : error ? (
        <p className="rounded-xl bg-fortune-terracotta/10 p-4 text-sm text-fortune-terracotta">{error}</p>
      ) : applications.length === 0 ? (
        <p className="text-fortune-ink/60">No applications found yet.</p>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fortune-ink/50">
          <span className="font-semibold uppercase tracking-wide">{applications.length} total</span>
          {Object.entries(counts).map(([status, n]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className="font-semibold">{n}</span> {statusLabel(status).toLowerCase()}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-fortune-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-fortune-ink/5 text-xs uppercase tracking-wide text-fortune-ink/50">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">ID number</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-fortune-ink/5">
            {applications.map((app) => {
              const status = (app.status || '').toUpperCase();
              return (
                <tr key={app.applicationId || app.id}>
                  <td className="px-4 py-3 font-medium text-fortune-ink">
                    {app.appRef || app.applicationId || app.id}
                  </td>
                  <td className="px-4 py-3">{app.firstName} {app.middleName ? `${app.middleName} ` : ''}{app.lastName}</td>
                  <td className="px-4 py-3">{app.phoneNumber}</td>
                  <td className="px-4 py-3">{app.idNumber}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLES[status] || 'bg-fortune-ink/10 text-fortune-ink'
                      }`}
                    >
                      {statusLabel(app.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/applications/${app.applicationId || app.id}`} className="font-semibold text-fortune-green">
                      Review →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}