# Security Plan — EVgoSmart

**Status:** Draft v1 · **Last updated:** 5 Nov 2026
**Baseline:** OWASP ASVS Level 2 for the MVP; OWASP Top 10; DPDP Act 2023 principles; PCI DSS SAQ A (no card data stored).

---

## 1. Security goals

1. Only the right person can see a booking, a vehicle, or a live location.
2. A customer cannot become a driver, dispatcher, or admin by changing a request.
3. A driver cannot spoof another driver's location or complete another driver's job.
4. A payment cannot be marked paid without a valid Razorpay signature or verified webhook.
5. A leaked browser bundle or client-side call cannot expose the database or server secrets.
6. Demo data and real data never mix.
7. Security failures are visible, logged, and recoverable.

**Assumption:** the browser is hostile. Every request is untrusted until the server validates the session, role, resource ownership, and input.

## 2. Threat model

| Threat | Example | Impact | Primary controls |
| --- | --- | --- | --- |
| Account takeover | Credential stuffing, leaked password, stolen session | Full account access | Argon2id/scrypt, HIBP, rate limits, email verification, MFA for admins, session rotation, secure cookies |
| OAuth misconfiguration | Attacker reuses a redirect or links an unverified email | Account takeover | Exact redirect URIs, PKCE/state, verified-email linking, trusted origins |
| IDOR | Customer changes `/bookings/<id>` to another customer's ID | Location/PII leak | Resource-level authorization in every service; never trust IDs alone |
| Role escalation | Client sends `role: "admin"` on profile update | Admin access | Role field not writable by users; server-side role checks; admin-only endpoints |
| Location privacy leak | Dispatcher/customer sees all vans; logs contain coordinates | Stalking/privacy harm | Channel-scoped realtime tokens; only assigned driver/customer; 30-day TTL; redacted logs |
| NoSQL injection | `{ email: { $ne: null } }` in a login or filter | Auth bypass/data leak | Zod strict types, `sanitizeFilter`, no raw query objects, allowlists |
| XSS | Stored name/notes rendered as HTML | Session theft | React escaping, no `dangerouslySetInnerHTML`, CSP, sanitize any rich text |
| CSRF | Cross-site POST to a state-changing route | Unauthorized action | SameSite cookies, origin checks, Better Auth CSRF protection, no GET mutations |
| Payment forgery | Client says "paid" without Razorpay | Revenue loss | Server-side signature verification + webhook as source of truth + amount/order checks |
| Webhook replay | Replaying a captured webhook | Duplicate payments/state | Signature, timestamp tolerance, `webhookEvents` idempotency |
| Dispatch manipulation | Driver spoofs location to get jobs | Fraud/unsafe dispatch | Server-only location publish, assignment checks, audit events |
| Abuse / DoS | Spam bookings, location floods | Cost/outage | Rate limits, quotas, body size limits, MongoDB ops/sec monitoring |
| Secret leakage | Mongo URI or Razorpay secret in client bundle | Full compromise | Server-only env vars, `NEXT_PUBLIC_` discipline, secret scanning, key rotation |
| Insider abuse | Admin views PII without reason | Privacy harm | Audit logs, least privilege, MFA, break-glass procedure |
| Supply chain | Malicious dependency | Code execution | Lockfile, `pnpm audit`, Dependabot, CodeQL, pinned versions, no unnecessary postinstall |
| Demo/prod mix-up | Seeding demo data into production | Data loss/fake records | Separate databases, `DEMO_MODE` guard, DB name check, separate keys |
| Email abuse | Verification/reset email bombing | Cost/reputation | Per-email/IP rate limits, provider caps, suppression, monitoring |

## 3. Authentication

### 3.1 Providers

- **Email + password** via Better Auth.
- **Google OAuth** via Better Auth.
- No phone OTP, magic link, or social providers in v1.

### 3.2 Password policy

- Minimum 12 characters, maximum 128.
- Reject breached passwords with the Have I Been Pwned plugin if enabled.
- Do not impose composition rules that encourage weak patterns; length + breach check is better.
- Hash with scrypt (Better Auth default, OWASP-approved) or Argon2id (`@node-rs/argon2`, 64 MiB, t=3, p=4). Pick one and document it; do not mix.
- Never log or email passwords.

### 3.3 Email verification

- Required before a customer can create a booking.
- Verification tokens are single-use, short-lived (default 1 hour), and stored hashed by Better Auth.
- Google OAuth accounts with a verified email are considered verified.
- If a user tries to sign up with an existing email, return a neutral response and notify the existing user; do not leak account existence.

### 3.4 Sessions

- Stored in MongoDB by Better Auth.
- HTTP-only, `Secure` in production, `SameSite=Lax`.
- 7-day expiry, 1-day update age, session rotation on privilege change.
- Revoke all sessions on password reset, role change, ban, and suspected compromise.
- Admin can list and revoke a user's sessions.
- Cookie cache, if enabled, is short (≤ 5 minutes) and is not a substitute for server-side session checks.

### 3.5 MFA

- **Admin:** mandatory TOTP via Better Auth `twoFactor()`.
- **Dispatcher:** strongly recommended; required before real customer data.
- **Driver/customer:** optional in v1; add passkeys later.
- Backup codes are hashed, single-use, and shown once.
- Admin routes and server actions check `twoFactorEnabled`; a user with the admin role but no MFA is redirected to enrollment and blocked from admin data.
- Recovery: an admin with MFA can reset another admin's MFA only through a documented break-glass process with audit logging.

### 3.6 OAuth

- Exact redirect URIs for localhost, preview, demo, and production.
- PKCE and state handled by Better Auth.
- Only link accounts when the provider reports `email_verified: true`.
- Do not auto-link by email if the provider does not verify email.
- Google client secret is server-only.

### 3.7 Sign-out and account deletion

- Sign-out clears the session cookie and revokes the session.
- Account deletion: soft-delete/anonymize PII; retain financial records as required; revoke sessions; remove from active dispatch.
- Data export: JSON of profile, vehicles, bookings, payments, and ratings, delivered after re-authentication.

## 4. Authorization

### 4.1 RBAC matrix

| Capability | Customer | Driver | Dispatcher | Admin |
| --- | --- | --- | --- | --- |
| Own profile | ✅ | ✅ | ✅ | ✅ |
| Own vehicles | ✅ | — | — | ✅ (read) |
| Create booking | ✅ | — | — | — |
| Read own booking | ✅ | — | — | ✅ |
| Read assigned booking | — | ✅ | — | ✅ |
| Read all active bookings | — | — | ✅ | ✅ |
| Read all historical bookings | — | — | — | ✅ |
| See assigned driver location | ✅ | — | ✅ | ✅ |
| See all van locations | — | — | ✅ | ✅ |
| See customer phone for active job | — | ✅ | ✅ | ✅ |
| Accept/decline job | — | ✅ (assigned) | — | — |
| Change booking status | — | ✅ (assigned, valid transition) | ✅ (override, audited) | ✅ (audited) |
| Assign/reassign van | — | — | ✅ | ✅ |
| Cancel booking | ✅ (own, before charging) | ✅ (assigned, reason) | ✅ | ✅ |
| Complete job + kWh | — | ✅ (assigned) | — | — |
| Create payment order | ✅ (own completed booking) | — | — | — |
| Verify payment | ✅ (own) | — | — | — |
| Refund | — | — | — | ✅ (audited) |
| Manage users/roles | — | — | — | ✅ |
| Manage vans/pricing | — | — | — | ✅ |
| Read audit log | — | — | — | ✅ |
| Reset demo data | — | — | — | ✅ (demo only) |

### 4.2 Enforcement rules

- Every service function receives an `Actor` object: `{ userId, role, sessionId }`.
- Every resource read/write calls a guard: `assertBookingAccess(actor, booking)`, `assertVehicleOwner(actor, vehicle)`, `assertDriverAssigned(actor, booking)`.
- Never rely on the UI hiding a button.
- Never trust `role` from the request body, query string, or JWT claims alone; read it from the server-side session/user record.
- Admin routes use both `requireRole('admin')` and MFA enforcement.
- Dispatcher access to customer phone numbers is limited to active jobs and audited.
- Driver access to a booking ends when the booking reaches `completed`, `cancelled`, `expired`, or `failed`.
- Use 404 for resources the actor cannot see, to avoid existence leaks; use 403 only when the resource is known and the action is forbidden.

### 4.3 MongoDB has no RLS

There is no database-level row security in MongoDB. Therefore:

- The browser never receives a MongoDB connection string or SDK.
- All database access is server-only (`import 'server-only'` in the DB module).
- No client-side aggregation or direct queries.
- Every service query includes the actor's scope (e.g., `customerId: actor.userId`) rather than fetching by ID and checking afterward.
- Integration tests must include IDOR cases for every resource.

## 5. Data protection and privacy

### 5.1 Data classification

| Data | Sensitivity | Storage | Retention |
| --- | --- | --- | --- |
| Name, email, phone | PII | MongoDB | Account life + 30 days after deletion |
| Precise location | Sensitive PII | MongoDB/GeoJSON, Ably transient | 30 days for pings; active booking only |
| Vehicle details/plate | PII | MongoDB | Account life |
| Booking history | PII/financial | MongoDB | 7 years (financial placeholder; legal review) |
| Payment IDs | Financial | MongoDB | 7 years |
| Card data | Restricted | **Never stored** | — |
| Audit logs | Sensitive | MongoDB | 1 year |
| Session/IP | PII | MongoDB | Session life + 30 days |
| Email logs | PII | MongoDB | 90 days |

### 5.2 Minimization

- Collect only what the booking needs: location, vehicle, connector, battery %, contact.
- Do not ask for Aadhaar, PAN, or driver documents in v1. Driver verification is an admin process outside the app.
- Do not store precise coordinates in logs, analytics, audit metadata, or error reports.
- Display approximate location to dispatchers until a job is assigned; exact location only for the assigned driver.
- Do not expose customer email/phone in public APIs or marketing pages.

### 5.3 Retention and deletion

- `driverLocations` has a 30-day TTL index.
- `auditLogs` has a 365-day TTL index.
- `rateLimits` has a TTL index.
- Booking/payment records are retained for financial/legal reasons; anonymize PII on deletion where possible.
- Add a documented retention table to the privacy policy.
- Backups inherit retention; document backup encryption and deletion.

### 5.4 DPDP Act 2023 (India) — MVP baseline

This is not legal advice; confirm with counsel before launch.

- Publish a privacy notice: what is collected, why, how long, who it is shared with (Google Maps, Razorpay, Resend, Ably, Vercel, MongoDB Atlas).
- Obtain consent at sign-up for processing and for location use; make location permission explicit and revocable.
- Provide a grievance contact and a way to request access, correction, and erasure.
- Notify affected users and the Data Protection Board of a personal data breach, per the Act's requirements.
- Use data processors under contracts with appropriate security obligations.
- Do not transfer data internationally without checking the Act's cross-border rules.
- Keep a record of processing activities.

### 5.5 PCI DSS

- No card data is stored, processed, or transmitted by our servers.
- Razorpay Checkout is hosted; we receive only payment/order IDs and signatures.
- This keeps the MVP in SAQ A territory. Do not add a custom card form.

## 6. API and input security

### 6.1 Validation

- Zod schemas at every boundary: route handler body/query/params, server action input, webhook payload, env vars.
- Reject unknown keys (`strict()`), enforce max lengths, enums, and numeric ranges.
- Coordinates: latitude −90..90, longitude −180..180; reject (0,0) unless explicitly valid.
- Battery: 0–100. Delivered kWh: 0 < x ≤ van capacity. Amount: integer paise, positive, ≤ configured max.
- Phone: E.164. Email: normalized lowercase, max 254.
- Strings: trim, max length, reject control characters.
- Pagination: `limit` max 50, cursor validated.

### 6.2 NoSQL injection

- Never pass `req.body`, `searchParams`, or a client object directly into a Mongoose query.
- Construct filters explicitly from validated values: `{ email: email.toLowerCase() }`, not `{ email: input }`.
- `mongoose.set('sanitizeFilter', true)` as defense in depth.
- Reject keys starting with `$` or containing `.` in user-supplied objects.
- Do not use `$where`, `$function`, or `mapReduce`.
- Do not expose a generic "filter" query parameter.

### 6.3 CSRF and CORS

- SameSite=Lax cookies; Better Auth origin checks.
- State-changing operations are POST/PATCH/DELETE only.
- Server Actions are same-origin; still validate the session and role.
- CORS: same-origin only. No wildcard origins. If a mobile app is added later, use an explicit allowlist and token auth.
- Webhooks are exempt from CSRF but require signature verification.

### 6.4 Rate limits

| Endpoint | Limit |
| --- | --- |
| Sign-in | 5/minute/IP + 10/hour/email |
| Sign-up | 3/hour/IP |
| Password reset | 3/hour/email + 10/hour/IP |
| Email verification resend | 3/hour/email |
| Booking creation | 5/hour/customer; 20/day/customer |
| Driver location | 1/5 seconds/driver |
| Payment order | 10/hour/customer |
| Payment verify | 20/hour/customer |
| Realtime token | 30/hour/user |
| Admin mutations | 60/hour/admin |
| Webhook | 100/minute/IP |
| Public read APIs | 60/minute/IP |

Implementation: MongoDB-backed fixed/sliding window using `rateLimits` with atomic `findOneAndUpdate`; return 429 with `Retry-After`. Better Auth's built-in rate limiter can cover auth endpoints; keep the custom limiter for domain endpoints.

### 6.5 Idempotency

- `POST /bookings` and `POST /payments/order` require `Idempotency-Key`.
- Store key + actor + request hash + response for 24 hours.
- Same key + different body → 409.
- Webhooks use `webhookEvents.eventId` uniqueness.

### 6.6 Error handling

- Public errors: stable code, human message, request ID. No stack traces, Mongo errors, or internal IDs.
- Log the full error server-side with the request ID.
- Do not reveal whether an email exists on sign-in/reset; use neutral messages.

## 7. MongoDB security

- Dedicated Atlas database user with `readWrite` on one database; no `dbAdmin`/`clusterAdmin` for the app.
- Strong generated password; rotate on suspicion.
- TLS required (`mongodb+srv` + TLS).
- Network access: production should use private endpoints or static egress. Demo may use `0.0.0.0/0` with TLS and a least-privilege user; document the risk.
- No direct client access; no Data API; no public GraphQL.
- Backups: M0 has no automated backups. Demo: nightly `mongodump` to encrypted storage with a tested restore. Production: Atlas Flex/M10 backups or an equivalent.
- Enable Atlas alerts for connections, ops/sec, storage, and slow queries.
- Audit admin actions in the app; Atlas database audit logs are a paid feature.
- Schema validation: Mongoose strict schemas + MongoDB JSON Schema validators for critical collections (`bookings`, `payments`) as defense in depth.
- Index sync is idempotent; no `autoIndex` in production.

## 8. Payments security

- Razorpay keys: `RAZORPAY_KEY_ID` (public in checkout) and `RAZORPAY_KEY_SECRET` (server-only).
- Create orders server-side; never trust an amount from the client.
- Verify `razorpay_signature` with HMAC SHA256 using the key secret.
- Fetch the payment from Razorpay and check `order_id`, `amount`, `currency`, and `status`.
- Use the webhook as the source of truth; the client callback is an optimization.
- Verify `X-Razorpay-Signature` against the **raw** request body; do not parse/re-serialize before verification.
- Timestamp tolerance and event ID idempotency.
- Reject amounts that differ from the booking's computed final amount.
- Refunds: admin-only, audited, with a reason; update payment/booking status in a transaction.
- Do not log full webhook payloads if they contain PII; hash/store the minimum.
- Test mode and live mode keys must never mix. A production build must fail if test keys are used with `NODE_ENV=production` and `ALLOW_TEST_PAYMENTS=false`.

## 9. Maps and API keys

- Browser key: restrict by HTTP referrer and APIs (Maps JavaScript, Places). It is public by design; restrictions are the control.
- Server key: restrict by API (Directions, Geocoding, Distance Matrix); never expose to the client.
- Separate keys per environment.
- Set per-API daily quotas and budget alerts in Google Cloud. A billing account is required; a budget alert is not a hard cap, so quota caps are mandatory.
- Do not proxy arbitrary URLs or accept a user-supplied Google API endpoint (SSRF).
- Cache ETA/geocode results; do not call Google on every keystroke.
- Privacy notice: Google Maps receives location/address data to render maps and compute routes.

## 10. Realtime security (Ably)

- Clients receive short-lived, capability-scoped tokens from the server.
- Customers can subscribe only to their active booking and assigned van.
- Drivers can subscribe only to their own job channel and booking.
- Dispatchers/admins can subscribe to the dispatch queue and active bookings.
- Clients cannot publish. Driver location is posted to the server and republished.
- Token TTL 1 hour; re-fetch on reconnect.
- Validate channel names server-side; never accept a channel name from the client for token issuance without an authorization check.
- Ably API key is server-only. Use a separate Ably app/key per environment.
- Polling fallback uses the same authorization checks.

## 11. Email security

- Resend API key is server-only.
- Authenticate the sending domain with SPF, DKIM, and DMARC before production.
- Use a dedicated subdomain (e.g., `mail.evgosmart.app`) for transactional email.
- Do not include sensitive data (full location, payment IDs) in email.
- Rate-limit verification/reset sends.
- Escape user-provided values in templates; React Email escapes by default.
- Handle bounces/complaints; suppress repeatedly failing addresses.
- Never send email to arbitrary addresses from a demo. Use console logging or the developer's verified address.

## 12. Infrastructure and secrets

### 12.1 Secret handling

- `.env.local` is gitignored. `.env.example` contains placeholders only.
- Vercel environment variables per environment (Development/Preview/Production).
- Server-only: `MONGODB_URI`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_SERVER_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ABLY_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN` (if server).
- Public: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_ABLY_CLIENT_KEY`? Ably client key is not needed with token auth; only the token endpoint.
- Never put a secret in a `NEXT_PUBLIC_` variable. Add a CI check for known prefixes.
- Rotate keys after any suspected exposure. Have a rollback plan.

### 12.2 Headers

Set in `next.config.ts` or `proxy.ts`:

- `Content-Security-Policy` with nonces; allow Google Maps, Razorpay Checkout, Ably, Vercel analytics (if used), and self. No `unsafe-eval` in production.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (only after HTTPS is stable).
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(self), camera=(), microphone=()`
- `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

CSP must include the Razorpay checkout domain and Google Maps domains; test checkout in staging. Do not weaken CSP to `unsafe-inline` globally; use nonces/hashes.

### 12.3 Browser and platform

- HTTPS only; HSTS.
- No service worker caching of API responses or PII in v1.
- If PWA is added, never cache authenticated API responses in the service worker.
- Local storage: only non-sensitive UI preferences. Session lives in an HTTP-only cookie.
- Map components lazy-loaded; no API keys in source maps. Disable production source maps or restrict them.

### 12.4 CI/CD security

- Branch protection on `main`; required review and passing checks.
- GitHub Actions: least-privilege `GITHUB_TOKEN`, pin third-party actions by SHA, no secrets in PR from forks.
- CodeQL, `pnpm audit --prod`, Gitleaks/TruffleHog, dependency review.
- Dependabot for npm and GitHub Actions.
- Vercel preview deployments use test keys and a non-production DB.
- No production deploy from an unmerged branch.
- Database migrations/index sync run as a separate, reviewed step; never auto-run destructive scripts.

## 13. Logging and monitoring

- Structured logs: timestamp, level, requestId, route, method, status, duration, actorIdHash, errorCode.
- Never log: passwords, tokens, cookies, authorization headers, full card/payment data, precise coordinates, full request bodies for auth/payment.
- Redact emails/phones in logs (e.g., `a***@example.com`).
- Audit events: login failures, role changes, bans, session revokes, booking reassignment, manual status override, refund, pricing change, demo reset.
- Sentry: scrub PII, disable `sendDefaultPii`, filter coordinates.
- Alerts:
  - 5xx rate > 1% for 5 minutes.
  - Auth failures > 50/minute.
  - Webhook signature failures > 5/minute.
  - Atlas ops/sec > 80 (M0).
  - Resend daily sends > 80.
  - Ably connection failures > 10% for 10 minutes.
  - Google Maps quota > 80% of daily cap.

## 14. Abuse and cost controls

- Rate limits as above.
- Max request body size (e.g., 100 KB) at the route handler/proxy.
- Zod max lengths and array sizes.
- Google Maps quotas and ETA caching.
- Resend daily cap monitoring; fallback to console/in-app only.
- Ably message throttling (10s location).
- Atlas ops/sec and storage alerts.
- Disable public sign-up for driver/dispatcher roles; only admin creates them.
- Block disposable email domains? Optional; can hurt legit users. Use email verification + rate limits instead.
- Bot protection: Vercel's built-in DDoS/bot protection; add Turnstile on sign-up if abuse appears.

## 15. Secure SDLC

- Every feature PR includes: tests, authorization check, input validation, audit event if privileged, and a rollback note.
- Security review required for: auth, roles, payments, location, file uploads, admin, webhooks, new third-party services.
- Use the `review-security` skill on those PRs.
- Threat-model new features in the PR description (short: asset, actor, abuse case, control).
- No direct pushes to `main`.
- No disabled TypeScript/ESLint rules without a comment and reviewer approval.
- No `any` in security-sensitive code; use `unknown` + Zod.
- Dependency updates reviewed weekly.

## 16. Go-live checklist

Before real customer data:

- [ ] Replace demo data with an empty production database.
- [ ] Rotate all keys; use live Razorpay keys with KYC complete.
- [ ] Buy and configure a domain; SPF/DKIM/DMARC for email.
- [ ] Upgrade MongoDB to a tier with backups and an SLA; test restore.
- [ ] Upgrade Vercel to Pro (commercial use) or move to an approved host.
- [ ] Upgrade Ably if >200 concurrent connections or >6M messages/month.
- [ ] Set Google Maps quotas and budget alerts; verify the server key is API-restricted.
- [ ] Enable admin MFA for every admin; require dispatcher MFA.
- [ ] Run the full IDOR/RBAC test suite against production-like data.
- [ ] Verify CSP with Razorpay Checkout and Google Maps in staging.
- [ ] Run a penetration test or an external security review.
- [ ] Publish privacy policy, terms, grievance contact, and retention policy.
- [ ] Configure Sentry/log alerts and an on-call contact.
- [ ] Write an incident response runbook and test a rollback.
- [ ] Verify backups are encrypted and restorable.
- [ ] Confirm data processing agreements with Atlas, Vercel, Google, Razorpay, Resend, Ably.
- [ ] Confirm GST/invoice treatment with a CA.
- [ ] Load-test dispatch with at least 100 vans and 50 concurrent users.

## 17. Incident response

1. **Detect:** alert or report; assign an incident lead.
2. **Contain:** revoke sessions/keys, disable the affected endpoint/feature flag, block IPs if needed.
3. **Assess:** scope, data affected, users affected; preserve logs.
4. **Notify:** follow DPDP breach notification and any contractual obligations; do not speculate publicly.
5. **Recover:** deploy a fix, rotate secrets, restore from backup if needed.
6. **Review:** blameless post-mortem, add tests/controls, update this document.

Emergency contacts and key owners must be documented outside the repo. Do not put phone numbers or secrets in `AGENTS.md`.

## 18. Security decisions to revisit

- Argon2id vs scrypt (pick one before launch).
- Passkeys/WebAuthn for customers and drivers.
- Field-level encryption for phone numbers (MongoDB CSFLE) if PII risk grows.
- Private networking for Atlas (Vercel static egress or PrivateLink).
- WAF/Turnstile if abuse appears.
- SIEM/centralized audit logs for production.
- Bug bounty or external pen test before scaling.
