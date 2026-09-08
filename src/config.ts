// ------------------------------------------------------------------
// Fortune Sacco Admin Review Portal — configuration
//
// Two backends:
//   CBS_READ_BASE  — widget/CBS site that holds applications (read-only)
//   CBS_SUBMIT_BASE — submit-to-core endpoint
//   ONBOARDING_BASE — the customer-onboarding backend (admin auth,
//                     user management, profile, notifications,
//                     membership form, reject)
// ------------------------------------------------------------------

// CBS read — the widget/CBS site that holds the applications.
export const CBS_READ_BASE =
  (import.meta.env.VITE_CBS_READ_BASE as string | undefined) ||
  'http://10.10.1.170:8087';

// CBS submit — where approve/push-to-core is delivered.
export const CBS_SUBMIT_BASE =
  (import.meta.env.VITE_CBS_SUBMIT_BASE as string | undefined) ||
  'http://localhost:8087';

// Onboarding backend — admin auth, user mgmt, profile, notifications,
// membership form, reject.
export const ONBOARDING_BASE =
  (import.meta.env.VITE_ONBOARDING_BASE as string | undefined) ||
  'http://localhost:5002/api';