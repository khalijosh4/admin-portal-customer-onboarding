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
// This is often a private LAN address and may not exist on a laptop or dev
// machine. The app handles that case by falling back to the onboarding API.
export const CBS_READ_BASE =
  (import.meta.env.VITE_CBS_READ_BASE as string | undefined) ||
  'http://10.10.102.132:8087';

// CBS submit — where approve/push-to-core is delivered.
export const CBS_SUBMIT_BASE =
  (import.meta.env.VITE_CBS_SUBMIT_BASE as string | undefined) ||
  'http://10.10.102.132:8087';

// Optional static Bearer token for the CBS/Spring API.
//   - Leave EMPTY when the backend whitelists the endpoints (permitAll).
//   - Set it only if the backend requires `Authorization: Bearer <token>`.
// When present it is attached to every CBS request.
export const CBS_TOKEN =
  (import.meta.env.VITE_CBS_TOKEN as string | undefined) || '';

// Onboarding backend — admin auth, user mgmt, profile, notifications,
// membership form, reject.
export const ONBOARDING_BASE =
  (import.meta.env.VITE_ONBOARDING_BASE as string | undefined) ||
  'http://localhost:5000/api';