# Fortune Sacco Admin Review Portal

A standalone admin portal for **reviewing membership applications** and
**submitting them to the CBS (Core Banking System)**.

The applications are entered by customers on a separate site (a widget), and
pushed into the CBS "core submission" API. This portal reads those applications
through that same API, lets the admin review the full details, then **approves &
submits to the core** to create the member's account.

## Where the data comes from

The portal talks to **two** CBS core-submission endpoints:

| Purpose | Endpoint |
|---|---|
| List applications | `GET {READ}/api/applications/all` |
| One application | `GET {READ}/api/applications/{applicationId}` |
| **Approve & submit to core** | `POST {SUBMIT}/api/applications/{applicationId}/submit-to-core` |

- `READ` — the widget/CBS site holding the applications (default `http://10.10.1.170:8087`).
- `SUBMIT` — where the approve/push-to-core call is delivered (default `http://localhost:8087`).

## Getting started

The CBS backend must be reachable at both hosts (the defaults above), then:

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5176`.

## Signing in

The CBS API exposes no authentication of its own, so the portal has a local
login gate. Defaults: username `admin`, password `admin123` (override in `.env`).

## Configuration (`.env`)

- `VITE_API_READ_BASE` — base URL to fetch applications from.
- `VITE_API_SUBMIT_BASE` — base URL to submit-to-core against.
- `VITE_ADMIN_USERNAME` / `VITE_ADMIN_PASSWORD` — the local login gate.

To build for production:

```bash
npm run build
npm run preview
```

## Features

- Login gate before any admin view.
- Dashboard listing **all applications** from the widget site, auto-refreshed
  every 15s (or on demand), with per-status counts.
- Application detail page showing every captured field in labelled sections
  (personal, employment & referral, accounts & services, address) plus which
  documents are on file.
- **Approve & submit to core** button that calls `submit-to-core` and surfaces
  the outcome (success / in workflow / failed).

> Note: the CBS API returns only document **tokens** (`idFrontUrl`, `idBackUrl`,
> `passportUrl`, `signatureUrl`) with no reachable image endpoint, so the portal
> currently shows whether each document is present rather than a live preview."# admin-portal-customer-onboarding" 
