# Tooling — OpenCode, Skills, and MCP

**Status:** Draft v1 · **Last updated:** 5 Nov 2026
**Current OpenCode setup:** no MCP servers configured yet (`list_mcp_resources` returned empty).

---

## 1. What is already available

This environment ships with useful **skills**. Skills are loaded on demand and cost no context until used.

| Skill | Use it for |
| --- | --- |
| `archify` | Generate architecture, sequence, and data-flow diagrams from these docs |
| `review-security` | Security review of auth, payments, location, RBAC, webhooks |
| `review-bugbot` | General code review of a change or PR |
| `emil-design-eng` | UI polish, component design, interaction details |
| `ask-sonner` | Toasts/notifications if we use Sonner |
| `animate` | Subtle motion for status changes, sheets, and route transitions |
| `opencode` | OpenCode configuration, MCP, skills, agents |
| `create-rule` | Generate project rules / conventions |
| `create-skill` | Create project-specific skills |
| `find-skills` | Discover more installable skills |
| `graphify` | Build a knowledge graph of the codebase as it grows |
| `babysit` | Keep a PR green once we start using PRs |
| `split-to-prs` | Split work into reviewable PRs |
| `find-animation-opportunities` | Read-only audit of where motion would help |

**Recommended first three:** `archify` (turn these docs into a diagram), `review-security` (before any auth/payment merge), `emil-design-eng` (after a design direction is chosen).

## 2. MCP servers to add

Add only what you need. Each MCP server adds tools and context. Start with **Context7**, **Playwright**, and **MongoDB**; add GitHub/Vercel/Sentry when the repo and deployment exist.

### 2.1 Context7 — up-to-date library docs

Use for Next.js 16, Better Auth, Mongoose, Razorpay, Google Maps, Ably, and React Email. It prevents the agent from coding against stale APIs.

```bash
opencode mcp add context7 --url https://mcp.context7.com/mcp
opencode mcp list
```

If `opencode mcp list` shows `needs authentication`, run `/mcps` in OpenCode and sign in. No API key is required for the public endpoint.

### 2.2 Playwright — browser automation and visual checks

Use for E2E tests, screenshots of the design demos, accessibility checks, and verifying the deployed flow.

```bash
opencode mcp add playwright -- npx -y @playwright/mcp@latest
opencode mcp list
```

### 2.3 MongoDB — inspect schema and queries

Use during development to inspect collections, indexes, and `explain()` output. Run it **read-only** against the demo database.

```bash
opencode mcp add mongodb \
  --env MDB_MCP_CONNECTION_STRING="{env:MONGODB_URI}" \
  -- npx -y mongodb-mcp-server@latest --readOnly
```

Set `MONGODB_URI` in your shell/`.env.local` before starting OpenCode. Never point this at the production database. The `--readOnly` flag is deliberate.

For Atlas OAuth, the MongoDB Atlas managed MCP server is an alternative, but the local read-only server is enough for this project.

### 2.4 GitHub — issues, PRs, CI

Add once the repo exists. The official remote server uses OAuth where available.

```bash
opencode mcp add github --url https://api.githubcopilot.com/mcp/
opencode mcp list
```

If OAuth is not supported in your client, use a fine-grained PAT with only the scopes you need:

```bash
opencode mcp add github \
  --url https://api.githubcopilot.com/mcp/ \
  --header 'Authorization=Bearer {env:GITHUB_MCP_TOKEN}'
```

Keep the PAT in an environment variable, never in `opencode.jsonc`.

### 2.5 Vercel — deployments and logs

```bash
opencode mcp add vercel --url https://mcp.vercel.com
```

OAuth via `/mcps`.

### 2.6 Sentry — errors (optional, after deployment)

```bash
opencode mcp add sentry --url https://mcp.sentry.dev/mcp
```

### 2.7 Chrome DevTools — performance and accessibility

```bash
opencode mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

Useful for Lighthouse-style checks, network inspection, and console errors in the design demos.

### 2.8 Do not add yet

- Filesystem MCP — OpenCode already has file tools.
- Generic shell MCP — unnecessary risk.
- Database write access — keep MongoDB read-only until there is a specific need.
- Figma MCP — add only if you move the design into Figma.

## 3. Project-specific skills to create

These encode EVgoSmart's workflow so any agent follows the same path.

### 3.1 `evgo-feature` — vertical slice workflow

Create at `.opencode/skills/evgo-feature/SKILL.md`.

```markdown
---
name: evgo-feature
description: Implement an EVgoSmart feature as a vertical slice with tests and a security review.
---

1. Read AGENTS.md, docs/PRODUCT.md, docs/ARCHITECTURE.md, and the relevant module.
2. Write the acceptance criteria and the data/API/UI changes.
3. Add the Mongoose model/index + Zod schema.
4. Add the service function with an Actor and an authorization guard.
5. Add the route handler (thin adapter) and/or server component.
6. Add the UI using components/ui + components/blocks; no one-off styles.
7. Add unit + integration tests, including an IDOR case.
8. Add a rate limit if the endpoint is public or abusable.
9. Add an audit event if the action is privileged.
10. Run pnpm lint, pnpm typecheck, pnpm test, and the relevant E2E.
11. Update docs/.env.example. Summarize the security impact.
```

### 3.2 `evgo-security` — change checklist

```markdown
---
name: evgo-security
description: Security checklist for EVgoSmart auth, payments, location, RBAC, and webhook changes.
---

- Who is the actor? Which role? Which resource? Is ownership checked server-side?
- Can a customer/driver access another user's ID by changing a URL or body?
- Is every input parsed with a strict Zod schema? Any raw object passed to Mongoose?
- Is the endpoint rate-limited? Is there an idempotency key for duplicates?
- Are secrets server-only? Any `NEXT_PUBLIC_` leak? Any precise location in logs?
- For payments: signature verified on the raw body? Amount checked? Webhook idempotent?
- For realtime: token capabilities scoped to the exact channel? Client cannot publish?
- Is the action audited? Is the audit record redacted?
- Are the tests covering the abuse case, not just the happy path?
```

### 3.3 `evgo-demo` — seed/reset guardrails

```markdown
---
name: evgo-demo
description: Seed or reset the EVgoSmart demo environment safely.
---

- Confirm DEMO_MODE=true.
- Confirm the database name ends in `_demo`.
- Never run against `evgo_prod`.
- Use the fixed seed EVGO_DEMO_SEED=42.
- Create demo users through Better Auth so password hashing is correct.
- Label all demo records with `isDemo: true` where applicable.
- Print a summary of accounts and counts after seeding.
```

## 4. OpenCode config

Create `opencode.jsonc` at the repo root after the scaffold:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "AGENTS.md",
    "docs/PRODUCT.md",
    "docs/ARCHITECTURE.md",
    "docs/SECURITY.md"
  ],
  "skills": [".opencode/skills"]
}
```

Add MCP servers with the CLI commands above; do not hand-write secrets into this file. OpenCode V2 uses `mcp.servers` if you configure by hand. Use `{env:NAME}` substitution for any header or environment value.

### OmniRoute local provider

The project-level `opencode.json` points the `omniroute` provider at `http://localhost:20128/v1` and reads its API key from `OMNIROUTE_API_KEY`. The project-level `opencode.jsonc` selects `omniroute/auto` by default and loads this project's instructions. Start OmniRoute and its local API service before starting OpenCode. If your OmniRoute endpoint uses a different address, update `baseURL` in `opencode.json`.

In the VS Code terminal, change to the project root and enter the key without displaying it:

```bash
cd /path/to/EVgoSmart
read -s 'OMNIROUTE_API_KEY?Paste your OmniRoute API key, then press Enter: '; echo
export OMNIROUTE_API_KEY
opencode
```

The variable remains available only in that terminal session. Never paste the key into project config, source files, or chat. If an API key was previously stored in project config, revoke it and create a replacement.

Check connections with:

```bash
opencode mcp list
```

Use `/mcps` in OpenCode to connect, disconnect, or authenticate servers. Do not run interactive `opencode mcp auth` through a background shell; use `/mcps`.

## 5. Suggested agent split

| Agent | Model | Job |
| --- | --- | --- |
| `build` | your main coding model | Implement vertical slices |
| `review` | a strong reviewer | Review diffs, tests, and security |
| `explore` | fast model | Search the codebase, summarize modules |
| `design` | vision-capable model | Review the design demos and screenshots |

Keep the main agent's context small: point it at `AGENTS.md` and the specific module, not the whole repo.

## 6. Daily workflow

```bash
pnpm dev                 # Next.js
pnpm db:sync             # indexes + validators
pnpm seed:demo           # demo data
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm emails:dev          # React Email preview
```

Before asking an agent to implement a feature:

1. Write the acceptance criteria in the issue.
2. Point to the module and the relevant docs.
3. Ask for a plan first.
4. Review the plan, then let it implement.
5. Run `review-security` on auth/payment/location changes.
6. Deploy a preview and test on mobile.

## 7. Free-tier guardrails

- Use a **budget alert** and **quota caps** on Google Cloud; a billing account is required even for the free Maps quota.
- Keep Razorpay in **test mode** until KYC is complete.
- Do not add a card to Vercel/Ably/Resend/Atlas for the demo; the free tiers do not require one.
- Do not enable paid Atlas backups on M0; use the documented `mongodump` demo backup instead.
- Monitor Resend's 100/day cap; the free plan fails sends rather than billing overage.
- Keep the demo database separate and seed-guarded.
