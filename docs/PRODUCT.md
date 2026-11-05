# Product Plan — EVgoSmart

**Status:** Draft v1 · **Last updated:** 5 Nov 2026
**Owner:** Shubham Raj (internship project) · **Build target:** production-ready MVP

---

## 1. Vision

EVgoSmart removes range anxiety by bringing the charger to the driver. A stranded EV owner opens the web app, shares their location, and a mobile charging van is dispatched with a live ETA. The driver gets enough charge to reach a destination or a fixed station safely.

The internship deck describes the pitch and the customer journey. This plan turns it into a real full-stack product with authentication, dispatch, payments, an operations console, and a security baseline.

## 2. Problem

- EV adoption is rising faster than reliable charging infrastructure.
- Drivers get stranded in unfamiliar or remote areas.
- The nearest station may be broken, occupied, or incompatible.
- Flatbed towing is slow, expensive, and can damage an EV powertrain.
- Existing roadside assistance is not designed for on-site energy delivery.

## 3. Product principles

1. **Calm in a crisis.** The interface should reduce panic, not add noise. One primary action, clear ETA, clear status.
2. **Trust is the product.** Verified drivers, transparent pricing, live tracking, and a visible support path.
3. **Operations first.** A beautiful customer app is useless if dispatch cannot assign, reassign, and monitor vans.
4. **Demo honestly.** The fleet is simulated and the stats are targets. The UI must say so.
5. **Security by default.** Location and payment data are sensitive. Authorization belongs on the server, never in the client.
6. **Reusable blocks.** Marketing sections, app shells, and domain components are built as documented blocks, not one-off pages.

## 4. Personas and roles

| Role | Who | Main jobs | Access |
| --- | --- | --- | --- |
| **Customer** | EV driver | Request charge, track van, pay, view history, rate | Own profile, own vehicles, own bookings |
| **Driver / technician** | Mobile charging van operator | Go online, accept job, navigate, update status, record kWh, complete job | Own profile, assigned van, assigned bookings, own 30-day history |
| **Dispatcher** | Operations controller | Monitor queue, assign/reassign vans, call customer/driver, handle exceptions | All active bookings, all vans, customer contact for active jobs |
| **Admin** | Business owner / internship evaluator | Manage users, roles, vans, pricing, audit logs, demo reset | Everything, with audit logging |

One user has one primary role in v1. A driver does not also act as a customer. Admin and dispatcher accounts are created by an admin, not by public sign-up.

## 5. Core journeys

### 5.1 Customer: request a charge

1. Sign up with Google or email/password; verify email.
2. Add a vehicle: make, model, connector type, battery capacity, plate.
3. Tap **Get help now**.
4. Confirm location (browser geolocation or address search), battery percentage, and connector.
5. See an estimated price and ETA; confirm the request.
6. Watch the status: `Requested → Assigned → En route → Arrived → Charging → Completed`.
7. See the assigned driver and van on the map; call or message via support.
8. Pay after the charge via Razorpay test checkout.
9. Rate the driver and download/view the receipt.

### 5.2 Driver: complete a job

1. Sign in; go online.
2. Receive an assigned job with customer location, vehicle, connector, and notes.
3. Accept or decline within 60 seconds (decline returns it to dispatch).
4. Start route → `En route`; location updates every 10 seconds while the job is active.
5. Arrive → `Arrived`; start charging → `Charging`.
6. Enter delivered kWh and charging notes; complete → `Completed`.
7. View own 30-day job history and earnings summary (earnings can be a later feature).

### 5.3 Dispatcher: run the board

1. See live queue, available vans, active jobs, and SLA timers.
2. Auto-dispatch assigns the best van; dispatcher can override.
3. Reassign if a driver declines or is stuck.
4. Call customer/driver from the job card (phone numbers visible only for active jobs).
5. Resolve exceptions: no van available, customer not reachable, payment failed.
6. Every override is written to the audit log.

### 5.4 Admin: manage the system

1. Invite/create dispatcher and driver accounts.
2. Manage vans, connector types, capacity, and availability.
3. Configure pricing rules and service areas.
4. Review audit logs and suspicious activity.
5. Reset or reseed the demo environment (demo only).

## 6. Booking lifecycle

```
requested ──assign──> assigned ──driver accepts──> en_route ──arrive──> arrived
    │                    │                              │                  │
    │                    └──decline/reassign────────────┘                  │
    │                                                                        ▼
    ├──cancel (customer/dispatcher)────────────────────────────────────> cancelled
    ├──expire (no van / no response)───────────────────────────────────> expired
    └──fail (system error)─────────────────────────────────────────────> failed
                                                                           │
                                                       start charging ────┘
                                                              ▼
                                                          charging
                                                              │
                                                       complete job
                                                              ▼
                                                          completed
```

Payment is a **separate state** on the booking:

`not_required → pending → paid → refunded / partially_refunded / failed`

A booking can be `completed` with `payment_status = pending` if the customer closes the checkout. The dispatcher sees unpaid jobs. The customer can retry payment from history.

### Transition rules

| From | To | Actor | Guard |
| --- | --- | --- | --- |
| — | `requested` | Customer | Verified email, vehicle belongs to customer, rate limit, valid location |
| `requested` | `assigned` | System / dispatcher | Van available, connector compatible, capacity sufficient, within service area |
| `assigned` | `en_route` | Driver | Driver assigned to booking; van assigned |
| `assigned` | `requested` | Driver / dispatcher | Decline or reassign; van released |
| `en_route` | `arrived` | Driver | Driver location near customer (or manual override with audit) |
| `arrived` | `charging` | Driver | Van connected; start reading recorded |
| `charging` | `completed` | Driver | Delivered kWh between 0 and van capacity; payment record created |
| `requested`, `assigned`, `en_route`, `arrived` | `cancelled` | Customer / dispatcher / admin | Reason required; refund rules if paid |
| `requested` | `expired` | System | No van found within 5 minutes |
| any active | `failed` | System / admin | Incident; reason required |

## 7. MVP scope

### In scope

**Public site**
- Landing page with product story, how it works, safety/trust, target metrics, pricing explanation, FAQ.
- Auth pages: sign in, sign up, verify email, forgot/reset password, two-factor.
- Demo banner and "book a demo" CTA.

**Customer app**
- Dashboard with active booking and quick request.
- Vehicle CRUD.
- Request flow with map/location picker, battery percentage, connector, price estimate.
- Live tracking with status timeline, driver/van card, ETA.
- Booking history (own, paginated) and receipt.
- Payment via Razorpay test checkout.
- Rating and feedback.
- Profile and security settings.

**Driver app**
- Online/offline toggle.
- Assigned job card, accept/decline, navigate.
- Status transitions, location publishing, kWh completion form.
- 30-day job history.
- Profile and vehicle/van details.

**Dispatcher console**
- Live queue, map of vans and active jobs.
- Assign/reassign, cancel, call links.
- Van availability and capacity.
- SLA timers and exception flags.

**Admin**
- User list, role management, ban/unban, session revoke.
- Van management.
- Pricing rules and service areas.
- Audit log viewer.
- Demo reset (demo environment only).

**Platform**
- Google + email/password auth.
- Email notifications.
- Ably realtime with polling fallback.
- Google Maps.
- Razorpay test payments.
- Seeded demo data and simulation controls.
- Security headers, rate limits, audit logs, admin MFA.

### Out of scope for v1

- Native iOS/Android apps (responsive PWA is enough).
- Real telematics, OCPP, or charger hardware integration.
- Real GPS hardware; driver phone location is the source.
- Route optimisation across many jobs; nearest-van + ETA is enough.
- Real payments in live mode (test mode only until KYC).
- Multi-tenant operators or multi-city isolation.
- Subscriptions, referrals, wallets, surge pricing.
- In-app chat; use phone/support link for v1.
- File uploads (profile photos, documents); add later with signed uploads.
- SMS/WhatsApp/push notifications.
- Public API for partners.

## 8. Demo mode

The internship demo must be honest and safe.

- A dedicated `demo` environment with a separate MongoDB database.
- `DEMO_MODE=true` shows a persistent banner: **Demo environment — simulated fleet, test payments**.
- Seeded accounts:
  - `customer@demo.evgosmart.test` / `Demo@12345`
  - `driver@demo.evgosmart.test` / `Demo@12345`
  - `dispatcher@demo.evgosmart.test` / `Demo@12345`
  - `admin@demo.evgosmart.test` / `Demo@12345`
  - These are seed-only accounts, marked verified, and blocked from production.
- 3 vans, 3 drivers, 6 customers, 8 vehicles, 30 bookings across the last 30 days, including 3 active bookings.
- Simulation controls for the dispatcher/admin:
  - Advance booking status.
  - Move a van along a route.
  - Trigger "no van available" and "payment failed" scenarios.
- Payments use Razorpay test mode only. The UI never says a real charge occurred.
- Emails are logged to the console or sent to the developer's address, not to arbitrary users.
- Seed script refuses to run unless `DEMO_MODE=true` and the database name ends in `_demo`.

## 9. Pricing and payments

The final pricing model is still a business decision. For the MVP:

- Configurable per city: `baseFee`, `perKwh`, `minimumCharge`, `currency`, `taxIncluded`.
- Estimate shown before confirmation: base fee + estimated kWh × per-kWh rate.
- Final amount after charging: base fee + delivered kWh × per-kWh rate.
- Payment after service, via Razorpay test checkout.
- No card data ever touches our servers; Razorpay Checkout is hosted.
- Refunds are manual via Razorpay dashboard in v1, with an audit log entry.
- DSP/legal: GST treatment and invoice format must be confirmed with a CA before live payments. The MVP can display "taxes included" and a demo invoice.

## 10. Notifications (email only)

| Event | Recipient | Template |
| --- | --- | --- |
| Sign-up | Customer | Verify email |
| Password reset | User | Reset password |
| Booking requested | Customer | Request received + ETA |
| Driver assigned | Customer | Driver/van details |
| Driver en route | Customer | Live tracking link |
| Charging complete | Customer | Receipt + payment link |
| Booking cancelled | Customer | Reason + next step |
| New job assigned | Driver | Job details |
| Job reassigned / cancelled | Driver | Reason |
| Payment failed | Customer | Retry link |
| No van available | Customer + dispatcher | Alternative instructions |
| Admin alert | Admin | Suspicious login / payment failure |

Email is not the source of truth. In-app status and the booking record are.

## 11. Success metrics

For the internship demo:

- A complete booking can be created, dispatched, tracked, charged, paid (test), and rated in under 5 minutes.
- 100% of protected API endpoints reject unauthenticated and wrong-role requests.
- Customer A cannot read Customer B's booking, vehicle, or location.
- 0 secrets in the repository; 0 high/critical dependency findings at demo time.
- Lighthouse mobile performance ≥ 85 on the landing page (demo data, no heavy map on first paint).
- All critical Playwright flows pass in CI.

For a future production launch:

- Median dispatch assignment < 60 seconds.
- Median response time < 30 minutes in the pilot city.
- Payment success > 97%.
- Support contacts per 100 bookings < 5.
- No P1 security incidents.

## 12. Decisions locked

| Decision | Choice |
| --- | --- |
| Delivery | Production-ready MVP / internship demo |
| Timeline | 6–8 weeks, solo |
| Roles | Customer, driver, dispatcher, admin |
| Interfaces | One responsive web app with role-based routes |
| Fleet | Simulated in demo; data model ready for real GPS |
| Payments | Razorpay test mode; pay after service |
| Email | Resend free tier; Brevo backup |
| Language | English |
| Database | MongoDB Atlas |
| Auth | Google + email/password; admin MFA |
| Maps | Google Maps Platform |
| Realtime | Ably free tier + polling fallback |
| Hosting | Vercel + free `*.vercel.app` domain |
| Data | Demo data only until go-live review |
| Agent tooling | OpenCode + `AGENTS.md` |

## 13. Open questions

1. **Pricing:** exact base fee and per-kWh rate for the demo? Default: ₹199 callout + ₹18/kWh, taxes included, clearly labelled "demo pricing."
2. **City:** demo city? Default: Bengaluru (dense, recognizable map). The deck is based in Assam; Guwahati/Silchar can be a later service area.
3. **Brand:** "EVgo" is an existing US charging brand. For a public launch, choose a distinct name or add a clear disclaimer. Domain is not purchased yet.
4. **Live payments:** Razorpay live mode needs KYC/business details. Test mode is fine for the internship.
5. **Domain:** custom domain (~₹800–1,500/year) is optional. The demo uses a `*.vercel.app` subdomain.
6. **MFA for dispatchers:** required or optional? Default: required for admin, strongly recommended for dispatcher.
7. **Data retention:** legal review needed. Default: location pings 30 days, audit logs 1 year, financial records 7 years.
8. **Driver earnings:** out of scope for v1 unless the internship rubric requires it.
