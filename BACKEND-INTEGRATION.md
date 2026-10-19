# Backend Integration Requirements — Fortune CBS API (Spring Boot)

Handoff for the Spring Boot backend developer. Two callers remain:

- the **Admin Portal browser** — list, detail, identity-review, submit-to-core;
- the **portal backend** (NestJS) — read-only pull of a single application
  (`GET /api/applications/{applicationId}`) to mirror it locally for reject and
  membership-form printing.

Neither caller sends an `Authorization` header, so any path still marked
`.authenticated()` returns `403 ACCESS_DENIED`.

## Base URL

- API: `http://10.10.102.132:8087`
- Swagger UI: `http://10.10.102.132:8087/swagger-ui/index.html`
- OpenAPI JSON: `http://10.10.102.132:8087/v3/api-docs`

## The blocker

Every call to `/api/applications/**` returns:

```http
HTTP/1.1 403
Content-Type: application/json
```
```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "You do not have permission to access this resource"
  },
  "meta": { "requestId": "req_...", "timestamp": "..." }
}
```

Cause: `SecurityConfig` marks `/api/applications/**` as `.authenticated()`, and
the callers do **not** send an `Authorization` header.

Paths that are already open (do not change): the `/api/auth/*-otp` endpoints,
`/api/webhooks/mpesa-callback`, `/actuator/health`, `/v3/api-docs/**`,
`/swagger-ui/**`.

## Current status — tested live on 2026-10-17

Partial whitelist deployed. Live probe results:

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/applications/all` | GET | 200 OK | allowed |
| `/api/applications` | GET | 200 OK | allowed |
| `/api/applications/{applicationId}` | GET | 400 | security passed (400 = bad test id) |
| `/api/applications/{applicationId}/core-status` | GET | 200 OK | allowed |
| `/api/applications/{applicationId}/submit-to-core` | POST | 400 | security passed |
| **`/api/applications/{applicationId}/identity-review`** | **POST** | **403** | **still ACCESS_DENIED — needs whitelisting** |
| `/api/customers` | GET / POST | 403 | still denied |

**Still required (blocks the portal's verify step):**

```java
.requestMatchers(HttpMethod.POST,
    "/api/applications/{applicationId}/identity-review").permitAll()
```

(`/api/customers` is no longer called from this repo.)

To cover everything in one rule:

```java
.requestMatchers("/api/applications/**").permitAll()
```

## Endpoints this repo calls

| # | Method | Path | Called by | Purpose |
|---|--------|------|-----------|---------|
| 1 | `GET`  | `/api/applications/all` | Admin Portal dashboard | list all applications |
| 2 | `GET`  | `/api/applications` | no longer called | was: list / filter by status |
| 3 | `GET`  | `/api/applications/{applicationId}` | Admin Portal detail + portal backend mirror sync | one application (with base64 document images) |
| 4 | `GET`  | `/api/applications/{applicationId}/core-status` | no longer called | was: core submission status |
| 5 | `POST` | `/api/applications/{applicationId}/identity-review` | Admin Portal | record the manual identity review |
| 6 | `POST` | `/api/applications/{applicationId}/submit-to-core` | Admin Portal | approve & submit to core |
| 7 | `POST` | `/api/customers` | no longer called | was: create the member in the CBS |
| 8 | `GET`  | `/api/customers` | no longer called | was: look up an existing customer |

## Request / response contracts (confirmed from the running Swagger)

### 5. Identity review

`POST /api/applications/{applicationId}/identity-review` — `Content-Type: application/json`

Request body (`IdentityReviewRequest`):

```json
{
  "decision": "APPROVED",
  "reason": "Reviewed ID, passport photo and captured selfie.",
  "reviewedBy": "Jane Reviewer"
}
```

- `decision`: enum string, pattern `^(APPROVED|REJECTED)$` — **required**
- `reason`: string, 0–1000 chars — **required**
- `reviewedBy`: string — **NEW.** Name of the logged-in admin performing the
  review (falls back to their email). Please add this field to
  `IdentityReviewRequest` and persist it, then echo it back as `reviewer` in
  `ReviewResponse` below. (Unknown JSON properties are ignored by Spring Boot,
  so accepting the field is the only backend change needed.)

Response `200` (`ApiResponse<ReviewResponse>`):

```json
{
  "success": true,
  "data": {
    "applicationId": "APP-...",
    "appRef": "FNS-...",
    "decision": "APPROVED",
    "reviewer": "Jane Reviewer",
    "reviewedAt": "2026-10-17T12:00:00Z"
  },
  "error": null,
  "meta": { "requestId": "req_...", "timestamp": "..." }
}
```

The portal blocks "Approve & submit to core" until this returns successfully.

### 6. Submit to core

`POST /api/applications/{applicationId}/submit-to-core` — no request body
(path `applicationId` only). Responds `200` with
`ApiResponse<CoreSubmissionResponse>`.

## What is needed from the backend

### Option A — whitelist these endpoints (recommended for internal endpoints)

In the `SecurityConfig` filter chain, **before** `anyRequest().authenticated()`:

```java
.requestMatchers(HttpMethod.GET,
    "/api/applications/all",
    "/api/applications",
    "/api/applications/{applicationId}",
    "/api/applications/{applicationId}/core-status",
    "/api/customers").permitAll()
.requestMatchers(HttpMethod.POST,
    "/api/applications/{applicationId}/identity-review",
    "/api/applications/{applicationId}/submit-to-core",
    "/api/customers").permitAll()
```

> If tighter security is preferred, whitelist only the `GET` rows and keep the
> write rows (`identity-review`, `submit-to-core`, `customers`) authenticated —
> the portal then needs a token (Option B).

### Option B — keep Bearer authentication

The API already issues JWTs (`sacco.jwt.secret`, `sacco.jwt.expiry-hours`) via
`POST /api/auth/send-otp` → `POST /api/auth/verify-otp` (and the email variants).
In that case the callers must obtain a token and send:

```http
Authorization: Bearer <jwt>
```

(The portal supports this out of the box — set `VITE_CBS_TOKEN`.)

### Recommended: expose the review status on the application detail

When `GET /api/applications/{applicationId}` is called, please include the stored
identity-review state so the portal can show "Identity verified" after a page
reload (otherwise the admin must re-verify). The portal recognises any of these
fields, treated as verified when the value is `APPROVED`:

`identityReviewDecision`, `identityReviewStatus`, `identityStatus`,
`identityReview.decision`, `identityReview.status`, `identityReviewed` (bool),
`identityVerified` (bool), `identityReviewedAt` (non-empty string).

### CORS

The Admin Portal calls the API **from the browser**, so CORS must allow its
origin(s):

- Dev: `http://localhost:5176`
- Deployed admin portal origin (e.g. `https://<host>/admin`)

Allowed methods: `GET, POST, OPTIONS`. Allowed header: `Authorization`
(and `Content-Type`). Expose the `Authorization` header if it is ever returned.

## Portal-side status (already implemented)

- Base URL points at `http://10.10.102.132:8087` (`VITE_CBS_READ_BASE` /
  `VITE_CBS_SUBMIT_BASE`).
- Sends **no** credentials by default (matches Option A). If Option B is chosen,
  set `VITE_CBS_TOKEN` and every CBS call is sent with `Authorization: Bearer`.
- GET/POST calls retry twice with backoff on network errors, timeouts and 5xx,
  with a 30s timeout.
- `identity-review` request body is `{ decision, reason }` exactly as specified.
