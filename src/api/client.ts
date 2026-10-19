import axios from 'axios';
import { CBS_READ_BASE, CBS_SUBMIT_BASE, CBS_TOKEN } from '../config';
import type { ApiEnvelope, CbsApplication, CoreSubmission, SubmissionOutcome } from '../types';

const READ_TIMEOUT_MS = 30000;
const SUBMIT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

const readClient = axios.create({ baseURL: CBS_READ_BASE, timeout: READ_TIMEOUT_MS });
const submitClient = axios.create({ baseURL: CBS_SUBMIT_BASE, timeout: SUBMIT_TIMEOUT_MS });

// When a token is configured (VITE_CBS_TOKEN), send it as a Bearer token on
// every CBS call. When it is empty the endpoints are expected to be whitelisted
// (permitAll) on the backend, so no Authorization header is sent.
function attachToken(config: any) {
  if (CBS_TOKEN) {
    config.headers = { ...(config.headers || {}), Authorization: `Bearer ${CBS_TOKEN}` };
  }
  return config;
}
readClient.interceptors.request.use(attachToken);
submitClient.interceptors.request.use(attachToken);


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: any): boolean {
  const status = error?.response?.status;
  if (status === undefined || status === null) return true;
  return status >= 500 || status === 429;
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === retries) throw error;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

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
  const status = error?.response?.status;
  const data = error?.response?.data;
  if (data && typeof data.message === 'string') return data.message;
  if (typeof data === 'string' && data) return data;
  if (status === 401) return 'Unauthorized (401) — the server rejected the request.';
  if (status === 403) return 'Forbidden (403) — you do not have access.';
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
    const secs = Math.round((error?.config?.timeout || READ_TIMEOUT_MS) / 1000);
    return `The server timed out after ${secs}s. Please retry.`;
  }
  if (error?.code === 'ERR_NETWORK' || status === undefined) {
    return `Network error — cannot reach ${error?.config?.baseURL || CBS_READ_BASE}. Please retry.`;
  }
  return error?.message || fallback;
}

/** Fetch every application from the widget/CBS read API. */
export async function fetchAllApplications(): Promise<CbsApplication[]> {
  const { data } = await withRetry(() =>
    readClient.get<ApiEnvelope<CbsApplication[]>>('/api/applications/all'),
  );
  return Array.isArray(data?.data) ? data.data : [];
}

/** Fetch a single application by its core id (APP-...). */
export async function fetchApplication(cbsApplicationId: string): Promise<CbsApplication | null> {
  const { data } = await withRetry(() =>
    readClient.get<ApiEnvelope<CbsApplication | CbsApplication[]>>(
      `/api/applications/${encodeURIComponent(cbsApplicationId)}`,
    ),
  );
  if (Array.isArray(data?.data)) return (data.data as CbsApplication[])[0] ?? null;
  return (data as ApiEnvelope<CbsApplication>).data ?? null;
}

export const IDENTITY_REVIEW_DEFAULT_REASON = 'Reviewed ID, passport photo and captured selfie.';

export interface IdentityReviewResult {
  decision?: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Record the manual identity review (ID, passport photo, selfie) for an
 * application. Required before the application can be approved & submitted.
 * POST {READ}/api/applications/{applicationId}/identity-review
 *
 * `reviewedBy` identifies the admin who performed/approved the review.
 */
export async function verifyIdentity(
  cbsApplicationId: string,
  payload: { decision: 'APPROVED' | 'REJECTED'; reason: string; reviewedBy?: string },
): Promise<IdentityReviewResult> {
  const { data } = await withRetry(() =>
    readClient.post(
      `/api/applications/${encodeURIComponent(cbsApplicationId)}/identity-review`,
      payload,
    ),
  );
  return ((data as any)?.data ?? data) as IdentityReviewResult;
}

/** Best-effort detection of an already-completed identity review on an application. */
export function isIdentityVerified(app: CbsApplication | null | undefined): boolean {
  if (!app) return false;
  const a = app as any;
  const statuses = [
    a.identityReviewStatus,
    a.identityReviewDecision,
    a.identityStatus,
    a.identityReview?.status,
    a.identityReview?.decision,
  ];
  if (statuses.some((v) => typeof v === 'string' && v.toUpperCase() === 'APPROVED')) return true;
  if (a.identityReviewed === true || a.identityVerified === true) return true;
  if (typeof a.identityReviewedAt === 'string' && a.identityReviewedAt) return true;
  return false;
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
    const { data } = await submitClient.post<ApiEnvelope<CoreSubmission>>(
      `/api/applications/${encodeURIComponent(cbsApplicationId)}/submit-to-core`,
      {},
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
