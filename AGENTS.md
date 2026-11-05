# AGENTS.md — EVgoSmart

This is the source of truth for coding agents working on EVgoSmart. Read it before changing code.

## Project

EVgoSmart is an on-demand emergency EV charging platform. A customer requests a charge, a dispatcher assigns a mobile charging van, the driver completes the charge, and the customer pays.

**Current phase:** Phase 3 complete (payments/email/admin). Phase 4 demo hardening is in progress — seed/reset scripts, demo banner, CI, and hardened security headers are live. Remaining: deploy demo, Playwright critical-flows suite, accessibility pass.

**Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, shadcn-style primitives, Supabase (Postgres + Auth + Realtime) with Drizzle ORM, PostGIS, Google Maps Platform, Razorpay (test), Resend, Vercel, pnpm.

**Docs:**
- `docs/PRODUCT.md` — scope, roles, journeys, decisions
- `docs/ARCHITECTURE.md` — modules, data model, API, dispatch, realtime
- `docs/SECURITY.md` — threat model, RBAC, controls, go-live checklist
- `docs/ROADMAP.md` — phases, definition of done, demo script
- `docs/TOOLING.md` — skills, MCP, OpenCode
- `docs/STACK-REVIEW.md` — why Supabase replaced MongoDB (decision record)

## Commands

```bash
pnpm dev              # local dev
pnpm build            # production build
pnpm start            # run the production build
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest
pnpm e2e              # playwright
```

Data, test, and email commands (`db:generate`, `db:migrate`, `seed:demo`, `demo:reset`, `test`, `emails:dev`) are added with the slices that need them. If a command does not exist yet, do not invent it. Add it to `package.json` and document it here.

## Non-negotiable rules

1. **Server-side authorization.** Every service call receives an `Actor` and checks role + resource ownership. Hiding a button is not security.
2. **Never expose the database or a secret key to the browser.** No `DATABASE_URL`, `SUPABASE_SECRET_KEY`, or SQL in a client component. The publishable key may be public only for Auth and Realtime, and only with RLS enabled. Use `import 'server-only'` in `lib/db`.
3. **Never trust client input.** Parse every body/query/param with a strict Zod schema. Use parameterised SQL through Drizzle; never build a query by string concatenation.
4. **Never trust a client role.** Read `role` from the server-side `profiles` record. Roles are not writable through profile updates or `user_metadata`.
5. **No secrets in the client.** Only `NEXT_PUBLIC_*` values may be public. Never prefix a secret with `NEXT_PUBLIC_`.
6. **No card data.** Razorpay Checkout only. Never build a custom card form.
7. **Verify payments server-side.** Signature on the raw webhook body, amount/order checks, idempotent event IDs.
8. **Location is sensitive.** Only the assigned driver and customer see precise location. No coordinates in logs, analytics, or audit metadata. 30-day retention for pings.
9. **Realtime is not the source of truth.** The database is. Clients cannot publish to Supabase Realtime; driver location goes through the server, and private channels are authorised by RLS.
10. **Demo data never touches production.** Separate Supabase project; `DEMO_MODE` guard; scripts refuse unless the project ref is on the demo allowlist.

## Architecture conventions

- `app/` — routes and route groups: `(marketing)`, `(auth)`, `(customer)`, `(driver)`, `(ops)`, `(admin)`.
- `modules/<domain>/` — service, schema, repository, types, tests. Business logic lives here.
- `components/ui/` — shadcn-style primitives. Do not fork them without a reason.
- `components/blocks/` — reusable presentational blocks. Blocks receive data via props; they never fetch, authorize, or read the session.
- `components/maps/` — map shell, markers, route, geolocation input.
- `lib/` — env, db, supabase, auth, errors, logger, rate limit, utils.
- `supabase/migrations/` — SQL migrations, RLS policies, functions, extensions.
- `emails/` — React Email templates.
- `scripts/` — seed/reset/ensure-admin.
- `tests/` — unit, integration, e2e.

Dependency direction: `app → modules → lib`. Do not deep-import another module's internals; expose a service function.

## Data and API conventions

- Money is integer paise (`integer`/`bigint`). Never floats. Never compute the final amount on the client.
- Dates are `timestamptz` in UTC; display IST.
- Locations are PostGIS `geography(Point, 4326)` with a GiST index. Order by `<->`, filter with `ST_DWithin` in metres.
- Every table has RLS enabled in the migration that creates it. No policy means no access.
- Reads map rows to DTOs; never return a raw database row from a route handler.
- Pagination is cursor-based; max page size 50.
- Use transactions for assignment + booking updates and payment + booking updates.
- Error shape: `{ error: { code, message, requestId } }`. No stack traces or Postgres errors.
- `Idempotency-Key` is required for booking creation and payment order creation.
- Rate-limit new public/abusable endpoints; return 429 with `Retry-After`.
- Audit privileged actions: role changes, bans, reassignment, manual status overrides, refunds, pricing changes, demo reset.

## Booking state machine

`requested → assigned → en_route → arrived → charging → completed`

Terminal: `cancelled`, `expired`, `failed`.

Do not invent transitions. Any manual override must be explicit, authorized, and audited.

## UI conventions

- Mobile-first; test at 360px, 768px, 1280px.
- Use design tokens; no one-off hex codes or magic spacing.
- Accessibility: semantic HTML, labels, focus rings, keyboard flow, contrast ≥ 4.5:1, `prefers-reduced-motion`.
- Loading, empty, error, and unauthorized states are part of the feature.
- Map components are client-only and lazy-loaded (`next/dynamic`, `ssr: false`).
- Marketing blocks: hero, feature grid, steps, stats, pricing, FAQ, CTA, footer.
- App blocks: status timeline, ETA card, driver card, booking summary, vehicle card, queue row, audit row.
- A block is reusable if it has typed props, no data fetching, no auth, and a documented example.

## Security rules for common changes

**New API route**
- Zod input, `requireSession`, role guard, resource guard, rate limit, audit if privileged, tests including IDOR.

**New admin action**
- `requireRole('admin')`, MFA enforced (`aal2`), audit log, confirmation in UI, no bulk destructive action without a typed confirmation.

**Payment change**
- Server computes amount; verify signature on raw body; check order/amount/currency; idempotency; test forged signature and replay.

**Location/realtime change**
- Private channel with an RLS policy on `realtime.messages`; server publishes; customer sees only the assigned van; 30-day retention; no precise coords in logs.

**Auth change**
- Do not write custom password/session crypto. Use Supabase Auth. Test `aal`/MFA enforcement, session revocation, email verification, and OAuth linking.

## Testing

- Every feature: unit tests for pure logic, integration tests against a real Postgres (local Supabase), E2E for the user path.
- Security tests: IDOR, role escalation, rate limit, webhook signature, SQL injection attempts, RLS cross-tenant reads.
- Run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
- If you cannot run E2E, say so explicitly and list what remains unverified.

## Environment

Copy `.env.example` to `.env.local`. Never commit `.env.local`. Use separate Supabase projects and keys for local/preview/demo/production. `DATABASE_URL` and `SUPABASE_SECRET_KEY` must never appear in a client bundle. Google Maps browser key is public but restricted; the server key is secret.

## Agent workflow

1. Read the relevant docs and module.
2. State acceptance criteria and a short plan.
3. Implement the smallest vertical slice.
4. Add tests, including the abuse case.
5. Run lint/typecheck/tests.
6. Self-review the diff for security and scope.
7. Update docs/.env.example.
8. Summarize what changed, what was tested, and what is still risky.

Use `review-security` for auth/payment/location/RBAC changes. Use `review-bugbot` before a PR. Use `archify` to update diagrams when the architecture changes.

Always use Context7 for library/API docs (resolve library ID, then query docs) whenever a change depends on a library or API's current syntax, config, or migration guide — including Next.js 16, Supabase, Drizzle, Zod, and Playwright. Never rely on recalled API details when a doc lookup is possible; verify against the current version first.

## Do not

- Do not disable TypeScript/ESLint rules to make code pass.
- Do not use `any` in security-sensitive code.
- Do not use `dangerouslySetInnerHTML` without a sanitizer and a review.
- Do not add a dependency for a problem the platform already solves.
- Do not run destructive DB commands against a non-demo database.
- Do not commit secrets, `.env.local`, tokens, or generated credentials.
- Do not claim a test passed if it was not run.
- Do not add features outside the MVP without updating `docs/PRODUCT.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
