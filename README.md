# EVgoSmart

On-demand emergency charging for electric vehicles — a mobile charging van comes to the driver instead of the driver going to a station.

**E2E testing:** `pnpm e2e` → test output writes to `.opencode/test-output/` (include this folder in `.gitignore`).
```bash
pnpm e2e
# or watch live
pnpm e2e --watch
```

## Dummy test emails

Use these to test signup / sign-in / role flows locally. All share password `Demo@12345` (meets the 12-char Supabase policy = 10 chars; use `DemoPass12345` if your project enforces ≥12).

| Email | Role | Use for |
| --- | --- | --- |
| `customer@demo.evgosmart.test` | customer | Vehicle CRUD, create booking, payment, rating |
| `driver@demo.evgosmart.test` | driver | Accept/decline, status walk, kWh completion |
| `dispatcher@demo.evgosmart.test` | dispatcher | Queue, assign/reassign, cancel |
| `admin@demo.evgosmart.test` | admin | User/van/pricing management, audit log |

These accounts are seed-only: `pnpm demo:seed` creates them with `email_confirm: true`. Or sign up fresh with any test email; your first sign-up becomes a `customer`. Flip roles in Supabase → `profiles` (or `POST /api/v1/admin/users/[id]/role` as admin).

## What is here

| Path | Purpose |
| --- | --- |
| `docs/PRODUCT.md` | Vision, personas, journeys, MVP scope, decisions |
| `docs/ARCHITECTURE.md` | Stack, modules, data model, dispatch, realtime, payments |
| `docs/SECURITY.md` | Threat model, auth, RBAC, privacy, go-live checklist |
| `docs/ROADMAP.md` | 6–8 week delivery plan and demo script |
| `docs/TOOLING.md` | Skills, MCP servers, OpenCode setup |
| `design/` | Three visual design directions (open `design/index.html`) |
| `AGENTS.md` | Engineering rules for coding agents |
| `CLAUDE.md` | Claude Code entry point (imports `AGENTS.md`) |

## Locked decisions

- **Product:** production-ready MVP, delivered as an internship project.
- **Roles:** customer, driver/technician, dispatcher, admin.
- **Flow:** simulated fleet for the demo, architecture ready for real GPS.
- **Payments:** Razorpay test mode, pay after service.
- **Auth:** Google + email/password, email verification, admin MFA.
- **Database:** MongoDB Atlas.
- **Maps:** Google Maps Platform.
- **Realtime:** Ably (managed WebSockets) with polling fallback.
- **Email:** Resend free tier (3,000/month, 100/day), Brevo as backup.
- **Hosting:** Vercel + free `*.vercel.app` domain for the demo.
- **Data:** seeded demo data only; no real customer data until go-live review.
- **Tooling:** OpenCode + `AGENTS.md`.

## View the design demos

Open `design/index.html` in a browser, or run:

```bash
cd design
python3 -m http.server 4173
```

Then visit <http://localhost:4173>.

| Direction | File | Positioning |
| --- | --- | --- |
| A — Calm Confidence | `design/calm-confidence.html` | Light, service-first, sage. Lowest risk, most human. |
| B — Night Ops | `design/night-ops.html` | Dark, operations-led, acid lime. Most distinctive console. |
| C — Premium Mobility | `design/premium-mobility.html` | Warm, editorial, terracotta. Most premium brand. |

Each demo is a standalone HTML file with the same five tabs: Landing, Customer, Driver, Dispatch, Notes. No backend, no build step — static interactions only.

**Decision pending:** pick one direction, or mix (for example, A's customer flow with B's dispatch console) before scaffolding.

## Status

- [x] Discovery and decisions
- [x] Product, architecture, security, and roadmap docs
- [x] Three design directions
- [ ] Design direction selected
- [ ] Repository scaffold
- [ ] MVP implementation
- [ ] Security review and demo deployment
