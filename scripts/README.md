# Scripts

- `seed-demo.ts` — seeds the demo project (requires `DEMO_MODE=true` + allowlist).
- `reset-demo.ts` — truncates app tables and deletes demo users. Same guards.

Run with:

```bash
DEMO_MODE=true pnpm tsx scripts/seed-demo.ts
DEMO_MODE=true pnpm tsx scripts/reset-demo.ts
```

Never point these at production. The guards refuse unless `DEMO_MODE=true`
and the Supabase project ref is in `SUPABASE_DEMO_PROJECT_REFS`.
