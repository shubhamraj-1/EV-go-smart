# Roadmap — EVgoSmart MVP

**Status:** Draft v1 · **Last updated:** 5 Nov 2026
**Assumption:** solo developer, 6–8 weeks, 20–30 focused hours/week.
**Deck phases:** research → UI/UX + frontend → logic + geo-APIs → testing + deployment.

---

## Phase 0 — Design direction and foundation (Week 1)

**Goal:** pick the visual direction, lock the stack, and make the repo buildable.

- [x] Review the 3 design demos in `design/`; choose one and list changes. (Design A — Calm Confidence)
- [x] Convert the chosen direction into design tokens (color, type, spacing, radius, shadows, motion).
- [x] Scaffold Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui.
- [x] Add `AGENTS.md`, `CLAUDE.md`, `opencode.jsonc`, lint/format/typecheck.
- [x] Add `lib/env.ts` with Zod-validated environment variables.
- [x] Add the Supabase client, Drizzle base config, and `pnpm db:push` (Supabase-native; MongoDB removed).
- [x] Add Supabase Auth: Google OAuth, email/password, verification, reset.
- [x] Add the app shells: marketing, auth, customer, driver, dispatcher, admin.
- [ ] Add CI (lint, typecheck, build).

**Acceptance:** a new developer can clone, copy `.env.example`, run `pnpm install && pnpm dev`, sign up, verify email (console), and see the correct role-based shell.

**Deck mapping:** Phase 1 (market research/tech discovery) and Phase 2 (UI/UX + frontend) start.

## Phase 1 — Customer vertical slice (Week 2)

**Goal:** a customer can add a vehicle and request a charge end-to-end (without dispatch yet).

- [x] Vehicle CRUD with ownership checks.
- [x] Request flow: location picker, address search, battery %, connector, price estimate.
- [x] `POST /bookings` with idempotency, rate limit, validation.
- [x] Booking detail page with status timeline (static/requested).
- [x] Booking history with cursor pagination.
- [x] Customer dashboard.
- [x] Unit tests for pricing and state transitions; integration tests for vehicle ownership.
- [x] IDOR tests: customer cannot read another customer's vehicle/booking.

**Acceptance:** customer A creates a booking, sees it in history, and cannot access customer B's data. Dispatcher sees it in a read-only queue.

## Phase 2 — Dispatch, driver, and realtime (Weeks 3–4)

**Goal:** the core operational loop works.

- [x] Van and driver models, seed data, indexes (`2dsphere`).
- [x] Candidate search with `$nearSphere` and connector/capacity filters.
- [x] Google Directions ETA provider with top-3 candidates and 60s cache.
- [x] Atomic assignment + 60s driver accept window.
- [x] Driver console: online/offline, assigned job, accept/decline, status transitions.
- [x] Driver location API + Ably publish; customer sees assigned van only.
- [x] Dispatcher console: live queue, map, assign/reassign, cancel, SLA timers.
- [x] Ably token endpoint with per-role channel capabilities.
- [x] Polling fallback.
- [x] Booking state machine tests, assignment race test, realtime authorization tests.
- [x] Audit events for reassignment and manual overrides.

**Acceptance:** a booking moves `requested → assigned → en_route → arrived → charging → completed` with live updates; dispatcher can reassign; customer cannot see other vans.

**Deck mapping:** Phase 3 (logic integration + geo-APIs).

## Phase 3 — Payments, email, admin (Week 5)

**Goal:** the job can be paid and administered.

- [x] Pricing rules per city; final amount from delivered kWh.
- [x] Razorpay test order, checkout, signature verification, webhook idempotency.
- [x] Payment status on booking; retry payment; receipt email.
- [x] Email provider (Resend/console) + React Email templates.
- [x] Notification records + resend/retry policy.
- [x] Admin: users, roles, ban/unban, session revoke.
- [x] Admin: vans, pricing rules, service areas.
- [x] Audit log viewer.
- [x] Admin MFA (TOTP) and enforcement.
- [x] Payment security tests: forged signature, amount mismatch, replay.
- [x] Email rate limits and failure handling.

**Acceptance:** completed job can be paid in Razorpay test mode; a forged client "paid" call is rejected; admin actions are audited; admin without MFA cannot access admin data.

## Phase 4 — Demo data, hardening, deployment (Week 6)

**Goal:** a reliable internship demo.

- [ ] Seed script with 30 days of history and 3 active bookings.
- [ ] Demo reset script with guards.
- [ ] Demo banner + target labels + payment disclaimer.
- [ ] Simulation controls (advance status, move van, no-van, payment failure).
- [ ] Playwright critical flows (customer, driver, dispatcher, admin).
- [ ] Accessibility pass (keyboard, labels, contrast, focus).
- [ ] Security review with `review-security` skill.
- [ ] CSP/headers verified with Google Maps and Razorpay.
- [ ] Rate limits tuned.
- [ ] Deploy to Vercel demo + Atlas `evgo_demo`.
- [ ] Configure Google OAuth redirects, Google Maps keys/quotas, Ably, Resend, Razorpay test webhook.
- [ ] Write the 3-minute demo script and a 1-page architecture/security summary for the report.

**Acceptance:** deployed demo runs the full flow in under 5 minutes; no high/critical findings; all critical tests pass; demo data resets cleanly.

## Phase 5 — Buffer and polish (Week 7–8, optional)

- [ ] Fix defects from the first demo run.
- [ ] Improve landing page copy, SEO, OG images.
- [ ] Add Sentry/log alerts.
- [ ] Add load test for dispatch.
- [ ] Prepare the internship report, slides, and viva questions.
- [ ] Record a backup demo video in case the network/API fails.

## Weekly cadence

| Day | Focus |
| --- | --- |
| Mon | Plan the vertical slice, update the issue list |
| Tue–Thu | Implement + tests |
| Fri | Demo to yourself, security review, deploy preview |
| Sat | Buffer, docs, internship report |
| Sun | Rest |

Keep a `docs/DECISIONS.md` or ADR log for changes. Do not start a second feature until the current slice has tests and a working preview.

## Definition of done (every feature)

- [ ] Acceptance criteria met.
- [ ] Types strict, no `any` in security-sensitive code.
- [ ] Zod validation at the boundary.
- [ ] Authorization check + IDOR test.
- [ ] Rate limit if public/abusable.
- [ ] Audit event if privileged.
- [ ] Unit + integration test; E2E for the user path.
- [ ] Empty, loading, error, and unauthorized states.
- [ ] Mobile layout checked.
- [ ] Accessibility: labels, focus, keyboard, contrast.
- [ ] Docs/`.env.example` updated.
- [ ] No secrets, no debug logs, no disabled lint rules.
- [ ] Preview deploy works.

## 3-minute demo script

1. **0:00–0:20 — Problem.** Open the landing page. "Range anxiety is not just a charging problem; it is a safety problem. EVgoSmart brings the charger to the driver."
2. **0:20–0:50 — Customer request.** Sign in as the demo customer. Show the saved vehicle. Tap "Get help now", use the demo location, show the price estimate, confirm.
3. **0:50–1:20 — Dispatch.** Switch to the dispatcher console. Show the new request, the nearest van, ETA, and the assignment. Mention the atomic assignment and the audit trail.
4. **1:20–2:00 — Driver + realtime.** Switch to the driver. Accept, start route, move the van (simulation), arrive, start charging, enter kWh, complete. Switch back to the customer and show the live status updates.
5. **2:00–2:30 — Payment.** Customer pays with a Razorpay test card. Show the receipt and payment status. Mention no card data touches our servers.
6. **2:30–2:50 — Security.** Show that a second customer cannot open the first customer's booking; show the audit log; show admin MFA.
7. **2:50–3:00 — Close.** "The demo fleet is simulated; the architecture is ready for real GPS, real payments, and a city pilot." Show the target metrics clearly labelled.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Scope creep | High | Timeline | Freeze v1 scope; park ideas in `docs/BACKLOG.md` |
| Google Maps billing/card | Medium | Demo blocked | Set up billing early, quota caps, fallback static map |
| Razorpay KYC/live | High | No live payments | Test mode only; state clearly in the demo |
| Atlas M0 limits | Medium | Slow/blocked | Indexes, pagination, ops/sec monitor; upgrade if needed |
| Vercel Hobby commercial restriction | Low for internship | Hosting issue | Non-commercial demo; upgrade before launch |
| Realtime complexity | Medium | Delays | Ably + polling fallback; realtime is not the source of truth |
| Auth edge cases | Medium | Security | Better Auth, tests, review-security, no custom crypto |
| Demo data leaking to prod | Low | Severe | Separate DB, `DEMO_MODE` guards, DB name check |
| Browser location permission denied | Medium | UX | Address search + manual pin fallback |
| Email deliverability | Medium | Missed notifications | Verified domain, Resend, in-app status source of truth |
| Solo developer illness | Medium | Timeline | Buffer week, recorded demo, docs-first |

## Internship deliverables

- Deployed demo URL.
- GitHub repo with README, docs, and tests.
- Architecture diagram and data model.
- Security summary (threat model, RBAC, auth, privacy).
- 3-minute live demo + backup video.
- Report sections: problem, literature/market, design, implementation, testing, security, results, future work.
- Viva prep: why MongoDB, why Better Auth, why Ably, how dispatch works, how authorization is enforced, what is simulated.
