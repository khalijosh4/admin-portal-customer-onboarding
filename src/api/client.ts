import axios from 'axios';
import { CBS_READ_BASE as API_READ_BASE, CBS_SUBMIT_BASE as API_SUBMIT_BASE } from '../config';
import type { ApiEnvelope, CbsApplication, CoreSubmission, SubmissionOutcome } from '../types';

/** Extract a human-readable message from any error shape. */
export function getApiErrorMessage(error: any, fallback = 'Something went wrong'): string {
  const envelope: ApiEnvelope<any> | undefined = error?.response?.data;
  if (envelope?.error) {
    const parts: string[] = [];
    if (envelope.error.code) parts.push(envelope.error.code);
    if (envelope.error.message) parts.push(envelope.error.message);
    if (envelope.error.field) parts.push(`field: ${envelope.error.field}`);
    if (envelope.error.retryAfter != null) parts.push(`retry after ${envelope.error.retryAfter}s`);
    if (parts.length) return parts.join(' — ');
    return envelope.error.code || envelope.error.message || fallback;
  }
  const data = error?.response?.data;
  if (data && typeof data.message === 'string') return data.message;
  if (typeof data === 'string' && data) return data;
  return error?.message || fallback;
}

/** Fetch every application from the widget/CBS read API. */
export async function fetchAllApplications(): Promise<CbsApplication[]> {
  const { data } = await axios.get<ApiEnvelope<CbsApplication[]>>(
    `${API_READ_BASE}/api/applications/all`,
    { timeout: 20000 },
  );
  return Array.isArray(data?.data) ? data.data : [];
}

/** Fetch a single application by its core id (APP-...). */
export async function fetchApplication(cbsApplicationId: string): Promise<CbsApplication | null> {
  const { data } = await axios.get<ApiEnvelope<CbsApplication | CbsApplication[]>>(
    `${API_READ_BASE}/api/applications/${encodeURIComponent(cbsApplicationId)}`,
    { timeout: 20000 },
  );
  if (Array.isArray(data?.data)) return (data.data as CbsApplication[])[0] ?? null;
  return (data as ApiEnvelope<CbsApplication>).data ?? null;
}

/**
 * Submit an approved application to the core to create the member's account.
 * Sent to the submit base. Returns a normalized result the UI can surface.
 */
export async function submitToCore(cbsApplicationId: string): Promise<{
  outcome: SubmissionOutcome;
  rawStatus?: string;
  coreReference?: string;
  message?: string;
  reason?: string;
  submission?: CoreSubmission;
}> {
  try {
    const { data } = await axios.post<ApiEnvelope<CoreSubmission>>(
      `${API_SUBMIT_BASE}/api/applications/${encodeURIComponent(cbsApplicationId)}/submit-to-core`,
      {},
      { timeout: 30000 },
    );
    const submission = data?.data || ({} as CoreSubmission);
    const raw = submission.status;
    const up = (raw || '').toUpperCase();
    const outcome: SubmissionOutcome =
      up === 'SUCCESS' ? 'success' : up === 'PENDING' || up === 'PROCESSING' ? 'submitted' : 'failed';
    return {
      outcome,
      rawStatus: raw,
      coreReference: submission.coreReference,
      message: submission.message,
      submission,
      reason: data?.error?.message,
    };
  } catch (err: any) {
    return {
      outcome: 'failed',
      reason: getApiErrorMessage(err, 'Could not submit the application to the core'),
    };
  }
}