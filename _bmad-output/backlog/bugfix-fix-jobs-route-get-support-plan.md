---
title: 'Fix: GET support para /api/jobs/nearby-items-digest'
type: bugfix
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-fix-jobs-route-get-support"
---

## Intent

**Problem:** `GET /api/jobs/nearby-items-digest` devuelve 404 porque la ruta solo aceptaba POST, y cron-job.org no permite configurar el método HTTP.

**Approach:** Registrar también el verbo GET en el mismo handler, con `Cache-Control: no-store` para evitar cacheo en proxies reversos.

## Suggested Review Order

- [`src/interfaces/http/routes/jobs.routes.ts`](../../src/interfaces/http/routes/jobs.routes.ts) — router con GET + POST y header no-store
- [`src/interfaces/http/middlewares/rate-limit.ts`](../../src/interfaces/http/middlewares/rate-limit.ts) — `createJobsRateLimit()` (factory en lugar de singleton para aislamiento en tests)
- [`tests/nearby-items-digest.test.ts`](../../tests/nearby-items-digest.test.ts) — nuevo describe `GET /api/jobs/nearby-items-digest` con 3 casos
