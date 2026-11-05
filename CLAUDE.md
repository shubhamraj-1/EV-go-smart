@AGENTS.md

# Claude Code notes

`AGENTS.md` is the source of truth. Read it first, then the docs it links.

## Before coding

1. Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and the relevant module.
2. State the acceptance criteria and a short plan.
3. Wait for approval if the change touches auth, payments, location, RBAC, or the data model.

## After coding

- Run `pnpm lint && pnpm typecheck && pnpm test`.
- Run the relevant E2E flow or explain why you could not.
- Summarize the security impact and any new environment variables.
- Update `docs/` and `.env.example` if behavior changed.

## Guardrails

- Never expose MongoDB or server secrets to the client.
- Never trust a role or amount from the client.
- Never store card data.
- Never log precise coordinates.
- Never seed demo data into a production database.
