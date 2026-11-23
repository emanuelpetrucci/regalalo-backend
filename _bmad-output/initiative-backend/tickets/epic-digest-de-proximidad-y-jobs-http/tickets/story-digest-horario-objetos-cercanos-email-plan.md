---
title: "Digest horario — migración, use case, TPL-010 y endpoint cron"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 10.1: Digest horario — objetos cercanos por email

**Épica:** 10 — Digest de proximidad y jobs HTTP  
**Estado:** done  
**Correct Course:** 2026-05-29 (EVT-015 / TPL-010)

## Spec de implementación

`_bmad-output/initiative-backend/archive-v6/spec-nearby-items-hourly-digest-email.md`

## Tasks / Subtasks

- [x] Migración `digest_notified_at` + índice parcial
- [x] `CRON_SECRET` en env + ejemplos
- [x] Repositorio: items pendientes, usuarios elegibles, marcar notificados
- [x] `SendNearbyItemsDigestUseCase` + DTO
- [x] TPL-010 + registry
- [x] `cronAuthMiddleware`, jobs controller/routes, rate limit `/jobs/*`
- [x] OpenAPI + tests

## Dev Agent Record

### Completion Notes

- Implementado EVT-015: `POST /api/jobs/nearby-items-digest` con `X-Cron-Secret`, agrupación por usuario, `digest_notified_at` antes del envío, TPL-010 best-effort.
- Tests: `nearby-items-digest.test.ts`, `email-tpl-010.test.ts`, snapshots actualizados.

## File List

- `src/infrastructure/database/supabase/migrations/016-items-digest-notified-at.sql`
- `src/domain/repositories/item.repository.ts`
- `src/infrastructure/database/supabase/item.repository.ts`
- `src/application/dtos/jobs/item-digest-result.dto.ts`
- `src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts`
- `src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts`
- `src/infrastructure/email/templates/registry.ts`
- `src/interfaces/http/middlewares/cron-auth.middleware.ts`
- `src/interfaces/http/middlewares/rate-limit.ts`
- `src/interfaces/http/controllers/jobs.controller.ts`
- `src/interfaces/http/routes/jobs.routes.ts`
- `src/interfaces/http/routes/index.ts`
- `src/config/env.ts`
- `src/openapi/registry.ts`
- `src/openapi/schemas/jobs.schemas.ts`
- `src/openapi/register-paths.ts`
- `openapi/openapi.json`
- `vitest.config.ts`
- `.env.dev.example`, `.env.prod.example`, `.env.local.example`
- `docs/email-template-design.md`
- `tests/nearby-items-digest.test.ts`
- `tests/email-tpl-010.test.ts`
- `tests/email-templates.snap.test.ts`

## Change Log

- 2026-05-29: Historia 10.1 — digest horario EVT-015 / TPL-010 implementado.
- 2026-05-29: Code review — claim atómico, TPL-010 copy/tests, HTTP 200 test.

### Review Findings

- [x] [Review][Defer] Consulta N+1 por item pendiente — MVP: aceptar `findPendingDigestItems` + `findEligibleDigestUsersForItem` por item; refactor a SQL único en backlog si sube el volumen horario. [`src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts:61-66`] — deferred, decisión producto 2026-05-29 (opción B)

- [x] [Review][Patch] Concordancia gramatical en TPL-010 [`src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts`] — fixed 2026-05-29

- [x] [Review][Patch] Sin test HTTP 200 con cron válido [`tests/nearby-items-digest.test.ts`] — fixed 2026-05-29

- [x] [Review][Patch] Carrera entre crons concurrentes — `claimPendingDigestItems` con `UPDATE … RETURNING` atómico al inicio [`src/infrastructure/database/supabase/item.repository.ts`] — fixed 2026-05-29

- [x] [Review][Patch] `itemCount` desincronizado — párrafo usa `items.length` tras parseo [`src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts`] — fixed 2026-05-29

- [x] [Review][Defer] Objetos perdidos si el cron externo falla >1 h — Solo entran items con `created_at >= NOW() - 1 hour`; si el job no corre, objetos de 1–2 h atrás con `digest_notified_at` NULL nunca se notifican. Comportamiento acotado por diseño de ventana horaria. [`src/infrastructure/database/supabase/item.repository.ts:392-394`] — deferred, ventana horaria explícita en spec
