// ------------------------------------------------------------------
// Types matching the CBS "core submission" API responses.
//
//   GET  /api/applications/all             -> list of applications (widget site)
//   GET  /api/applications/{applicationId} -> one application
//   POST /api/applications/{applicationId}/submit-to-core -> push to core
//
// Every response uses the envelope:
//   { success: boolean, data?: any, error?: ErrorDetail, meta?: Meta }
// ------------------------------------------------------------------

export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
}

export interface ApiErrorDetail {
  code?: string;
  message?: string;
  field?: string;
  fields?: Record<string, unknown>;
  retryAfter?: number;
  unlocksAt?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorDetail;
  meta?: ApiMeta;
}

/** A single application returned by the widget/CBS site. */
export interface CbsApplication {
  id: number;
  /** The application id in the core, e.g. APP-2026-7EDC3418. Used for submit-to-core. */
  applicationId?: string;
  /** Human-friendly reference, e.g. FNS-739343. */
  appRef?: string;
  phoneNumber?: string;
  idNumber?: string;
  email?: string;
  salutation?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  employmentStatus?: string;
  employerName?: string;
  workAddress?: string;
  referralStaffNo?: string;
  referralName?: string;
  nomineeName?: string;
  nomineeRelationship?: string;
  mpesaReceiptNumber?: string;
  paymentAmount?: number;

  // Document tokens (no HTTP endpoint currently serves these images).
  idFrontUrl?: string;
  idBackUrl?: string;
  passportUrl?: string;
  signatureUrl?: string;
  selfieUrl?: string;

  iprsVerified?: boolean;

  // Manual identity review (admin action), when present on the application.
  identityReviewStatus?: string;
  identityReviewDecision?: string;
  identityStatus?: string;
  identityReviewed?: boolean;
  identityReviewedAt?: string | null;
  internetBanking?: boolean;
  mobileBanking?: boolean;
  paybill?: boolean;
  paybillNumber?: string;
  paybillBusinessName?: string;
  paybillAlertPhone?: string;
  paybillAlertPhone2?: string;
  standingOrderEnabled?: boolean;
  standingOrderAmount?: number;
  standingOrderFrequency?: string;

  status?: string;
  rejectionReason?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;

  nearestBranch?: string;
  maritalStatus?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  city?: string;
  state?: string;
  district?: string;
  country?: string;
}

/** Raw status enum the core reports for a submission. */
export type CoreSubmissionRawStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRY'
  | string;

/** The data object returned by submit-to-core. */
export interface CoreSubmission {
  submissionId?: number;
  applicationId?: string;
  appRef?: string;
  status?: CoreSubmissionRawStatus;
  coreReference?: string;
  message?: string;
  submittedAt?: string;
}

/** Admin-facing interpretation of a core submission outcome. */
export type SubmissionOutcome = 'submitted' | 'success' | 'failed';

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  RETRY: 'Retry',
};

export function statusLabel(status?: string): string {
  if (!status) return '—';
  return STATUS_LABELS[status.toUpperCase()] || status;
}