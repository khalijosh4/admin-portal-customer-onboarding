// ------------------------------------------------------------------
// Central configuration for the admin review portal.
//
// This portal talks to the CBS "core submission" API that stores the
// applications submitted by the standalone widget site:
//
//   GET  {API_READ_BASE}/api/applications/all              -> all applications
//   GET  {API_READ_BASE}/api/applications/{id}             -> one application
//   POST {API_SUBMIT_BASE}/api/applications/{id}/submit-to-core -> push to core
//
// The two bases default to the hosts you provided; override via env.
// ------------------------------------------------------------------

// Read base — the widget/CBS site that holds the applications.
export const API_READ_BASE =
  (import.meta.env.VITE_API_READ_BASE as string | undefined) ||
  'http://10.10.1.170:8087';

// Submit base — where approve/push-to-core is delivered.
export const API_SUBMIT_BASE =
  (import.meta.env.VITE_API_SUBMIT_BASE as string | undefined) ||
  'http://localhost:8087';