---
title: 'Fix: eliminar ventana de 1 hora del digest de objetos cercanos'
type: bugfix
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-fix-digest-remove-time-window"
---

## Intent

**Problem:** El cron de `nearby-items-digest` devolvía `processedItems: 0` porque la query `claimPendingDigestItems` exigía `created_at >= NOW() - INTERVAL '1 hour'`. Si el cron externo fallaba (ej. 429 de cron-job.org) los objetos publicados en esa hora quedaban permanentemente sin notificar — la próxima ejecución los excluía por haberse publicado hace más de 1 hora.

**Approach:** Eliminar la restricción temporal de la query UPDATE. La idempotencia ya está garantizada por `digest_notified_at IS NULL`; el campo se marca al reclamar, así que ningún objeto se notifica más de una vez.

## Suggested Review Order

- [`src/infrastructure/database/supabase/item.repository.ts:388`](../../src/infrastructure/database/supabase/item.repository.ts) — cláusula WHERE del UPDATE eliminada (cambio principal)
- [`docs/architecture.md:802`](../../docs/architecture.md) — flujo resumido actualizado (sin `created_at >= NOW() - 1 hour`)
- [`docs/delta-backend-EVT015.md:28`](../../docs/delta-backend-EVT015.md) — nota de migración y query de referencia actualizadas
- [`docs/delta-email-flow-EVT015.md:19`](../../docs/delta-email-flow-EVT015.md) — condicion EVT-015 actualizada
- [`_bmad-output/initiative-backend/deferred-work.md`](./deferred-work.md) — nuevos deferred: N+1 amplificado y cron retry silencioso
