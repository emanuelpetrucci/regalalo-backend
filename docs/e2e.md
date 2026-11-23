# E2E backend API

Playwright tests seed data via protected routes under `/api/e2e`. The frontend never connects to Postgres directly.

## First-time setup

```bash
cp .env.e2e.example .env.e2e
# Edit secrets if needed

npm run e2e:db:create
npm run e2e:db:migrate
```

## Day-to-day

```bash
npm run dev:e2e
```

Each `POST /api/e2e/scenarios/:name` purges and rebuilds the scenario. No manual cleanup between specs.

## Headers

All E2E routes require:

```
x-e2e-secret: <E2E_SECRET from .env.e2e>
```

## Safety

- `E2E_ENABLED` is forced off when `NODE_ENV=production`.
- Routes return `404` when E2E is disabled.

## Database

Use a dedicated database (`nolv_e2e`) so dev data in `nolv` is untouched.

`npm run e2e:db:recreate` drops and recreates the DB (slow; CI or corrupted schema).
