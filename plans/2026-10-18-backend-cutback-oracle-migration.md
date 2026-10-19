# Admin Portal — Backend Cut-Down + PostgreSQL → Oracle Migration

**Date:** 2026-10-18 · **Decisions confirmed:** start fresh in Oracle · lean/portal-only cut · baseline DDL script · schema `DIGITALSOLUTIONS` · remove the "Recent notifications" list only (keep the tab + compose form)

**Oracle target (received):** host `10.10.1.26` · port `1521` · service name `FRTNPDB` · login `uat`/`uat` · objects in schema `DIGITALSOLUTIONS`.
**Phase-0 result:** TCP probe `10.10.1.26:1521` → **reachable ✓**. Credentials live only in `backend/.env` (gitignored ✓).

---

## 1. Current state

Two backends serve the portal:

| Backend | Role | Status |
|---|---|---|
| Spring Boot CBS — `http://10.10.102.132:8087` | Applications of record: list, detail (base64 images), identity-review, submit-to-core | External, called directly by the browser. **Stays unchanged.** |
| Local NestJS — `http://localhost:5000/api` | Copied wholesale from the customer-onboarding project: 9 modules, 9 tables, Postgres (docker-compose), `synchronize:true` in dev | **This is what we cut and re-point to Oracle.** |

The portal only uses **16 local endpoints**: admin login, profile/password, user management, notifications (bell + send), application listing, reject, membership-form print. The other ~40 routes (customer wizard, OTP, payments/STK, IPRS, OCR/liveness/uploads, catalog) are onboarding-only dead weight — and several are unguarded, i.e. attack surface.

**Hidden dependency (the real trap):** the portal's *Reject* and *Print membership form* actions first resolve a **local** application row (`src/api/onboarding.ts:154`, matched by cbsApplicationId/reference/phone/national ID), and the print service reads local `Application` + `nextOfKin` + image binaries (`print-form.service.ts:88-90,530`). With a fresh Oracle DB and no customer wizard writing rows, that table would be permanently empty → both features break. This drives the design below.

---

## 2. Target state

```
Browser (Vite :5176)
 ├─ read/identity-review/submit ──► Spring Boot CBS :8087   (unchanged, direct)
 └─ auth/users/notifications/reject/print ──► NestJS :5000/api ──► Oracle (new)
                                                    │
                                                    └─ pull-through sync: on first
                                                       resolve, fetch app from CBS,
                                                       upsert into Oracle (+images,
                                                       +next of kin)
```

**Oracle schema — 5 tables** in `DIGITALSOLUTIONS`, all carrying an **`AP_` prefix** to guarantee zero collision with existing objects in that shared schema (its `USERS`/`APPLICATIONS`-style tables stay untouched):

| New table | Replaces |
|---|---|
| `AP_ADMIN_USERS` | `admin_users` |
| `AP_APPLICATIONS` | `applications` |
| `AP_NOTIFICATIONS` | `notifications` |
| `AP_NEXT_OF_KIN` | `next_of_kin` |
| `AP_IMAGES` | `images` |

Dropped entirely: `otp_codes`, `payments_history`, `customer_contacts`, `application_documents` (filesystem fallback no longer needed — `getImageBinary` prefers the `images` table, `documents.service.ts:133-134`).

---

## 3. Workstreams

### WS1 — Backend cut-down (portal-only)

**Remove entirely**
- `otp` module: `/otp/request`, `/otp/verify`, `OtpCode` entity — but **keep `AdvantaSmsService` + `EmailOtpService`**, relocated into `notifications` (reject SMS + admin "send to member" reuse them).
- `payments` module (all STK/callback/test routes, `FortunePaymentsService`, `PaymentRecord`).
- `iprs` module, `catalog` module.
- `applications` controller wizard routes (POST create + 7 PUT step endpoints); service methods `createDraft`, step savers, `recordContactsAtSubmission`, `nextReferenceNumber`.
- `documents` upload/liveness routes, `OcrService`, `LivenessService`, `storage.util`, `ApplicationDocument` entity, `uploads/` static serving in `main.ts`.
- `AdminApprovalService` (`approve`, `push-to-core` — the portal approves via Spring directly) and its CBS-create/payment-settlement hooks.
- `StaleApplicationJob` (30-min sweep; dashboard already polls CBS every 15s).
- Unused admin routes: `DELETE /admin/applications/:id/documents/:docId`.
- Postgres-only migration, docker-compose Postgres service, `eng.traineddata`.

**Keep (the portal's surface)**
- Auth: `POST /admin/login`, profile GET/PATCH, change/complete password, JWT strategy/guard.
- Users: list/create/reset-password/set-active.
- Applications: `GET /admin/applications`, `GET /admin/applications/:id`, `POST :id/reject`, `GET :id/membership-form` **+ new sync endpoint (WS3)**.
- Notifications: list, unread-count, read, read-all, templates, send.
- Slimmed `cbs` module reduced to a read-only `GET {CBS}/api/applications/:id` client (drops `createCustomer`, `core-status`, `submit-to-core`).
- `DocumentsService.getImageBinary` (images-table only) + `PrintFormService`.

### WS2 — PostgreSQL → Oracle

1. **Deps:** `+ oracledb` (6.x, thin mode — pure JS, no Instant Client; needs Oracle 12.1+), `− pg`.
2. **Connection** (both `app.module.ts` and `config/typeorm.config.ts`):
   ```ts
   type: 'oracle',
   host: process.env.DB_HOST, port: 1521, serviceName: 'FRTNPDB',
   username / password from .env, poolSize: 10,   // NOT driver:{poolMax} — TypeORM passes `driver` as the oracledb module itself
   // NO DataSource-level `schema` — see note below
   ```
   All values from `backend/.env` (`DB_HOST/DB_PORT/DB_SERVICE/DB_USERNAME/DB_PASSWORD`). No TLS needed on the internal network; thin mode (no Instant Client).

   **⚠ Oracle schema lessons learned in Phase 2 (working config):**
   - **Never set DataSource-level `schema`.** TypeORM's `MigrationExecutor` then reads the history table schema-qualified (`"DIGITALSOLUTIONS"."migrations"`) while `OracleQueryRunner` creates it *unqualified* in the session's current schema (`UAT`) → guaranteed `ORA-00942` on `migration:run`. Verified empirically 2026-10-18.
   - Instead declare the schema **per entity**: `@Entity({ name: 'AP_APPLICATIONS', schema: 'DIGITALSOLUTIONS' })`. `EntityMetadata.build()` prioritizes decorator schema, producing `"DIGITALSOLUTIONS"."AP_…"` in every SELECT/INSERT/UPDATE/JOIN (`metadata.tablePath` → `QueryBuilder.getTableName()`). The TypeORM history table then sits unqualified in `UAT` — consistent create/read, harmless bookkeeping.
   - Connections' `CURRENT_SCHEMA` is `UAT` (TypeORM never issues `ALTER SESSION`), so **raw DDL object names must be schema-qualified too**: `CREATE INDEX "DIGITALSOLUTIONS"."IDX_…"`, not just the table reference — otherwise the index silently lands in `UAT` (Oracle allows cross-schema index creation with uat's privileges). All 6 indexes initially landed in UAT; fixed + DDL corrected.
   - Migration-history: `UAT.migrations` (created by TypeORM on first `migration:run`).
   **Conflict policy:** entities declare the prefixed name — `@Entity('AP_ADMIN_USERS')`, `@Entity('AP_APPLICATIONS')`, … — so nothing we create can ever clash with pre-existing tables in `DIGITALSOLUTIONS`, including a `USERS` table. Baseline DDL always qualifies: `"DIGITALSOLUTIONS"."AP_APPLICATIONS"`.
   **Privilege check (Phase 0):** creating objects in someone else's schema requires ownership or `CREATE ANY TABLE`. The probe runs `SELECT username FROM all_users WHERE username IN ('UAT','DIGITALSOLUTIONS')`, lists `DIGITALSOLUTIONS` tables (conflict scan + inventory), and does a create/drop of a throwaway `AP_PROBE` table there. If `uat` lacks rights, fallback order: (a) DBA runs `GRANT CREATE ANY TABLE, CREATE INDEX, CREATE SEQUENCE, ALTER SESSION TO uat` (or owner runs the baseline DDL once), (b) use DIGITALSOLUTIONS owner credentials if provided.
3. **Entity type mapping** (TypeORM boots only if these are Oracle-supported):

   | Postgres today | Oracle target | Count / location |
   |---|---|---|
   | `type:'enum'` | `varchar2(30)` (TS union types unchanged) | 6: application `status/documentIdType/employmentStatus/standingOrderFrequency`, `admin_users.role` |
   | `jsonb` | `simple-json` → CLOB | 6 in `application.entity.ts` (products/services/paybill/ocr/iprs/coreSubmission) |
   | `timestamptz` | `'timestamp with time zone'` | 4 in application entity |
   | `bytea` | `type: Buffer` → BLOB | `images.data` |
   | `type:'date'` stored as string | `varchar2(10)` (ISO) | `dateOfBirth/documentIssueDate/documentExpiryDate` — avoids ORA-01861 format-mask binds |
   | uuid PK | keep — driver maps to VARCHAR2(36), client-generated | 9 → 5 tables |
   | boolean / decimal(12,2) / `timestamp` | OK as-is (driver normalizes) | — |

   No `ILIKE`, `ON CONFLICT`, `RETURNING`, `now()`, array or `::` usage exists; the 3 QueryBuilders are portable (verify `notifications.service.ts:205` alias-less UPDATE on Oracle; reference-number `LIKE 'FS-2026-'` prefix is already uppercase, Oracle LIKE is case-sensitive-safe). Existing unique-violation handling already covers `ORA-00001` (`applications.service.ts:96`).
4. **Schema creation:** one versioned **baseline Oracle migration** (TypeORM migration class, raw DDL creating the five `"DIGITALSOLUTIONS"."AP_*"` tables + indexes) → `npm run migration:run`. Turn `synchronize` **off** in `app.module.ts:61` and remove it from `seed-admin.ts`.
5. **Seed:** run DDL → `npm run seed:admin` → first login.

### WS3 — CBS pull-through sync (makes reject/print work on an empty DB)

- **New endpoint:** `GET /api/admin/applications/by-cbs/:cbsApplicationId` (JWT-guarded).
  Flow: fetch `GET {CBS_CORE_BASE_URL}/api/applications/:id` → map payload → upsert `AP_APPLICATIONS` (match cbsApplicationId → reference → phone → national ID) → decode payload base64 images into `AP_IMAGES` → map nominees into `AP_NEXT_OF_KIN` → return local id.
- **Frontend change 1 (resolve):** rewrite `resolveOnboardingApplicationId` (`src/api/onboarding.ts:154-166`) to call the new endpoint instead of listing local apps. Reject/print flows then work unchanged.
- `GET /admin/applications` listing continues to work off the local mirror.

### WS3b — UI: remove the "Recent notifications" list

- Delete only the **"Recent notifications"** section (`src/pages/admin/AdminNotifications.tsx:180` and its list block) — the page keeps its heading and the **"Send a notification to a member"** compose form.
- Everything else stays: the nav "Notifications" tab, the header bell dropdown (30s polling), and **all backend notification endpoints** (list, unread-count, read, read-all, templates, send) — none become unused.

### WS4 — Config & cleanup

- `backend/.env`: replace DB block with Oracle vars; delete IPRS / FORTUNE_PAYMENTS / OTP / STORAGE / S3 / OCR blocks. Keep APP, JWT, EMAIL, ADVANTA, CBS, ADMIN_SEED, THROTTLE.
- Root `.env` (VITE_*) unchanged; `VITE_ONBOARDING_BASE` name left alone (cosmetic, zero-churn).
- Delete `docker-compose.yml` (Postgres container no longer needed — Oracle is external).
- `backend/package.json`: drop `pg`, `tesseract.js`, `multer`+types, `dayjs`, `uuid`, `@nestjs/schedule`, `@nestjs/serve-static` (never imported); add `oracledb`; rename package/description from "customer onboarding" to admin portal.
- `main.ts`: remove `./uploads` static + its manual CORS middleware; optionally wire `ThrottlerGuard` via `APP_GUARD` (it's configured today but never enforced).
- Update README / BACKEND-INTEGRATION.md status notes; rebuild `backend/dist` (or delete it).

### WS5 — Verification

1. `npm run build` in backend — tsc catches every dead reference to removed code.
2. `migration:run` against Oracle → exactly 5 `AP_*` tables in `DIGITALSOLUTIONS`; `seed:admin` → OK.
3. Portal: login → force-password-change → profile → users CRUD.
4. Notifications: bell polls, unread count, templates, read-all, send (real SMS/email); Notifications page shows compose form **without** the "Recent notifications" list.
5. Against a real CBS id: dashboard list (15s poll) → detail → **sync resolve → reject** → **membership-form download opens in Word with embedded images**.
6. Removed routes return 404 (no onboarding surface exposed).
7. Full stack via `npm run dev:all` / `start-app.bat`.

---

## 4. Execution order (checkpoints)

| Phase | Work | Checkpoint |
|---|---|---|
| 0 | ~~Receive credentials~~ ✓ · ~~TCP probe~~ ✓ (10.10.1.26:1521 reachable) · install `oracledb` + DB-level probe: version, `UAT`/`DIGITALSOLUTIONS` ownership, existing tables, create/drop `AP_PROBE` in schema | **✓ Done** — DDL rights in `DIGITALSOLUTIONS` confirmed |
| 1 | WS1 cut-down (originally planned against local Postgres; Postgres is now irrelevant — cut runs against Oracle) | **✓ Code done 2026-10-18** — otp/payments/iprs/catalog modules + controllers/services/entities deleted (15 files/dirs); `AdvantaSmsService` moved into `notifications/`, `EmailService` (trimmed from `EmailOtpService`); `CbsService` reduced to read-only `getApplication`; module/entity lists trimmed in `app.module.ts` + `typeorm.config.ts`; uploads static + CORS middleware removed from `main.ts`; `build` passes. **Boot/smoke on :5001 blocked** — 10.10.1.26 & 10.10.102.132 became unreachable (network drop) mid-test; retry when back |
| 2 | WS2 Oracle: deps, config, entity mappings, baseline DDL, seed | **✓ Done 2026-10-18** — baseline migration ran (5 `AP_*` tables + PK/FK/unique/secondary indexes in `DIGITALSOLUTIONS`, history in `UAT.migrations`), `seed:admin` OK, build + boot on :5001, `POST /admin/login` SELECT+UPDATE verified end-to-end |
| 3 | WS3 sync endpoint + frontend `resolve` change + WS3b notification-list removal | **✓ Code done 2026-10-18** — `GET /admin/applications/by-cbs/:cbsApplicationId` (JWT) implemented in `applications.service.syncFromCbs` (CBS pull → match cbsApplicationId→ref→phone→national ID → upsert AP_APPLICATIONS → AP_IMAGES base64 decode with mime sniff → AP_NEXT_OF_KIN replace; local `rejected` status never overwritten by CBS); frontend `resolveOnboardingApplicationId` now calls it (404→null, other errors propagate); `AdminNotifications` "Recent notifications" card + `listNotifications` usage removed (helper kept — header bell uses it); backend + frontend builds green. **Live CBS/Oracle test pending network** |
| 4 | WS4 env/deps/docs cleanup | **✓ Done 2026-10-18** — `backend/.env` pruned 125→69 lines (dropped OTP/IPRS/FORTUNE_PAYMENTS/STORAGE/S3/OCR/UPLOADS/DB_SCHEMA/catalog constants; kept APP/JWT/ADVANTA/CBS/ADMIN_SEED/EMAIL/THROTTLE); `package.json` dropped `pg`, `tesseract.js`, `multer`+types, `dayjs`, `uuid`+types, `@nestjs/schedule`, `@nestjs/serve-static`, unused `ts-loader` (40 pkgs pruned; `sharp` kept — print-form uses it), package renamed to admin portal; `docker-compose.yml` deleted; README + `BACKEND-INTEGRATION.md` updated to new architecture; ThrottlerGuard wiring left out (plan marked optional — no behavior change) |
| 5 | WS5 verification pass | **Not started — blocked on network**: 10.10.1.26:1521 and 10.10.102.132:8087 both unreachable since ~19:25 (VPN/drop); needs boot+smoke, migration re-check, login/notifications/reject/print/sync end-to-end, removed-routes 404 sweep, `npm run dev:all` |

## 5. Risks

| Risk | Mitigation |
|---|---|
| Oracle type pitfalls booting TypeORM (enum/jsonb/bytea/timestamptz/date) | Explicit mapping table above; Phase 1/2 decoupled so a bad mapping fails fast at boot, isolated from the cut-down |
| `typeorm.config.ts` registers only 4 of 9 entities → migrations silently skip tables | Fixed as part of WS2 |
| CBS `POST …/identity-review` still returns 403 (per `BACKEND-INTEGRATION.md`, 2026-10-17) | **External blocker** — needs the Spring team's whitelist before end-to-end approve testing; not part of this repo |
| Print form (926 lines) tightly coupled to entity fields | Keep `applications` columns intact initially; optional slimming of payment/OCR columns only after tsc passes |
| Oracle unreachable / insufficient privileges (CREATE TABLE) | Phase 0 probe; if the schema user lacks DDL rights, DBA runs the baseline script once |
| Internal network drop (10.10.x.x) mid-session — Oracle + CBS both unreachable since 19:25 | All code phases build-green offline; WS5 boot/smoke/sync tests deferred until the route returns, then run the full checkpoint list |
| Fresh DB ⇒ empty local data | By design; WS3 fills on demand |

## 6. Inputs needed from you

1. ~~Oracle connection details~~ ✓ — `10.10.1.26:1521`, service `FRTNPDB`, `uat`/`uat`, schema `DIGITALSOLUTIONS`.
2. Outcome of the Phase-0 privilege probe: if `uat` cannot create in `DIGITALSOLUTIONS`, either ask the DBA for `GRANT CREATE ANY TABLE … TO uat` / have the schema owner run the baseline DDL, or send DIGITALSOLUTIONS owner credentials.
3. Confirm SMS + SMTP keep sending live (keys stay in `backend/.env`).
