# Fortune Sacco Admin Review Portal

A standalone admin portal for **reviewing membership applications** and
**submitting them to the CBS (Core Banking System)**, with admin user
management, notification (SMS/email) sending, application rejection and
membership-form printing, backed by its own **NestJS + Oracle** backend.

The applications are entered by customers on a separate site (a widget), and
pushed into the CBS "core submission" API. This portal reads those applications
through that same API, lets the admin review the full details (including
document images), then **approves & submits to the core** to create the member's
account. Reject and membership-form printing work against a local Oracle mirror
that is filled on first use (see "CBS mirror sync" below).

## Where the data comes from

The portal talks to **two** backends:

| Backend | Purpose |
|---|---|
| CBS core-submission API | Application list/detail + approve & submit to core |
| Portal backend (NestJS + Oracle) | Admin auth (JWT), user management, profile, notifications, reject, membership form, CBS mirror sync |

### CBS endpoints

| Purpose | Endpoint |
|---|---|
| List applications | `GET {READ}/api/applications/all` |
| One application (includes base64 document images) | `GET {READ}/api/applications/{applicationId}` |
| **Review identity (required before approve)** | `POST {READ}/api/applications/{applicationId}/identity-review` |
| **Approve & submit to core** | `POST {SUBMIT}/api/applications/{applicationId}/submit-to-core` |

- `READ` — the widget/CBS site holding the applications (default `http://10.10.102.132:8087`).
- `SUBMIT` — where the approve/push-to-core call is delivered (default `http://10.10.102.132:8087`).

### Portal backend endpoints (admin-facing)

| Purpose | Endpoint |
|---|---|
| Sign in | `POST /api/admin/login` |
| Own profile | `GET/PATCH /api/admin/profile` |
| Change password | `POST /api/admin/profile/change-password` |
| Force password change (first login) | `POST /api/admin/profile/complete-password-change` |
| List/create users | `GET/POST /api/admin/users` |
| Reset password / set active | `POST /api/admin/users/:id/reset-password` · `POST /api/admin/users/:id/set-active` |
| Applications | `GET /api/admin/applications` · `GET /api/admin/applications/:id` |
| **CBS mirror sync** (pull one application into Oracle) | `GET /api/admin/applications/by-cbs/:cbsApplicationId` |
| **Reject** (with reason) | `POST /api/admin/applications/:id/reject` |
| **Print membership form** | `GET /api/admin/applications/:id/membership-form` |
| Notifications | `GET /api/admin/notifications` · `GET .../unread-count` · `POST .../:id/read` · `POST .../read-all` · `GET .../templates` · `POST .../send` |

## Getting started

The CBS site and the portal backend must be reachable (defaults above), then:

```bash
# portal backend (NestJS + Oracle) — first run only: npm run migration:run && npm run seed:admin
npm run dev:backend

# frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5176`.

Backend configuration (Oracle connection, JWT, SMS/email, CBS base URL, admin
seed) lives in `backend/.env` (gitignored).

## Signing in

Sign in is handled by the **portal backend** (`POST /api/admin/login`).
Admin accounts are created on the portal backend (see the admin Users page).
New accounts must change their temporary password on first login.

## Configuration (`.env`)

- `VITE_CBS_READ_BASE` — base URL to fetch applications from.
- `VITE_CBS_SUBMIT_BASE` — base URL to submit-to-core against.
- `VITE_CBS_TOKEN` — optional Bearer token for the CBS/Spring API. Leave empty
  when the backend whitelists the endpoints (`permitAll`); set it only if the
  backend requires `Authorization: Bearer <token>`.
- `VITE_ONBOARDING_BASE` — base URL of the portal backend (admin auth, users,
  notifications, reject, membership form, CBS mirror sync). Default
  `http://localhost:5002/api` (port 5000 is used by another local project).

> Backend integration requirements (endpoints to whitelist, contracts, CORS) are
> documented in [`BACKEND-INTEGRATION.md`](./BACKEND-INTEGRATION.md).

To build for production:

```bash
npm run build
npm run preview
```

## Features

- JWT sign-in against the onboarding backend; forced password change for new/reset accounts.
- Dashboard listing **all applications** from the widget site, auto-refreshed
  every 15s (or on demand), with per-status counts.
- Application detail page showing every captured field in labelled sections
  (personal, employment & referral, accounts & services, address), live
  document-image previews (base64 returned by the CBS API) with a lightbox.
- **Approve & submit to core** button that calls `submit-to-core` and surfaces
  the outcome (success / in workflow / failed with retry).
- **Reject with a reason** — raises a confirmation modal; the member is notified
  by SMS.
- **CBS mirror sync** — reject and print automatically pull the application
  from CBS into the portal's Oracle database on first use
  (`GET /api/admin/applications/by-cbs/:cbsApplicationId`).
- **Print membership form** — downloads the pre-filled Word membership form.
- **Admin user management** (create user, reset password, activate/deactivate,
  super-admin only).
- **My profile** (edit name/email/phone, change password).
- **Notification portal** — pick a member application, choose SMS/email/both,
  compose a freeform message or use a predefined template, and send.
- **Notification bell** in the header with unread count and mark-all-read.
- Favicon (`src/assets/fortune logo.png`).