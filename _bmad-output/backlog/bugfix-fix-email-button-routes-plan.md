---
title: 'Fix rutas incorrectas en botones de emails'
type: bugfix
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-fix-email-button-routes"
---

## Intent

**Problem:** Dos emails tenían botones con rutas que no coincidían con las rutas del frontend Angular: el digest de objetos cercanos (TPL-010) enlazaba a `/explore` (inglés) cuando la ruta real es `/explorar`, causando 404. El email de selección de receptor (TPL-003) enlazaba a `APP_PUBLIC_URL` (landing page), que dispara `purgeAuthStorageGuard` y cierra la sesión del usuario.

**Approach:** Corregir la ruta `/explore` → `/explorar` en TPL-010. En TPL-003, pasar `sessionId` desde el use-case y construir el enlace a `/entregas/${sessionId}` para llevar al receptor directamente a su sesión de entrega.

## Suggested Review Order

1. [`src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts:82`](../../src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts) — cambio de ruta `/explore` → `/explorar`
2. [`src/infrastructure/email/templates/tpl-003-receiver-selected.ts:30-34`](../../src/infrastructure/email/templates/tpl-003-receiver-selected.ts) — extracción de `sessionId` y construcción del enlace a la sesión
3. [`src/application/use-cases/item/select-receiver.use-case.ts:62-69`](../../src/application/use-cases/item/select-receiver.use-case.ts) — `sessionId` agregado a las variables del email TPL-003
