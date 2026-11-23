---
title: 'Corregir creación de reportes bloqueada por reports_reason_check'
type: bugfix
created: 2026-10-25
baseline_commit: '0fbad9ca22a4a5c2028a65d39fcaf88809065453'
status: done
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/PRD-REP-BE-01.md'
ticket: "story-fix-reports-reason-check"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/reports` está devolviendo 500 porque la inserción en `reports` falla con `reports_reason_check` al enviar el motivo `fraude_o_enganio`, que sí forma parte del contrato API/documentación. El fallo rompe la funcionalidad principal del módulo de reportes y degrada UX al responder error interno en lugar de un resultado estable y predecible.

**Approach:** Alinear de forma robusta el contrato de motivos entre base de datos y backend, reparando el check constraint para evitar drift de esquemas y endureciendo el manejo de error para que una desalineación futura no se exponga como 500. El fix debe preservar compatibilidad con los valores existentes del contrato público y mantener trazabilidad en OpenAPI/tests.

## Boundaries & Constraints

**Always:** mantener Clean Architecture; no tocar rutas/contratos ajenos a reportes; conservar los 8 motivos definidos para reportes como fuente de verdad del API; mapear fallas de constraints de dominio a errores de cliente explícitos (no 500 genérico); agregar o ajustar pruebas enfocadas al flujo de creación de reportes.

**Ask First:** si aparece evidencia de datos productivos históricos usando claves legacy incompatibles con el contrato actual y se requiere estrategia de backfill masivo o reglas de normalización que cambien payloads públicos.

**Never:** introducir ORM/query builder; cambiar semántica funcional de negocio de `CreateReportUseCase` (límites, anti auto-reporte, captcha, etc.); modificar manualmente `openapi/openapi.json`; degradar tipos a `string` genérico perdiendo type safety.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Usuario autenticado envía `POST /api/reports` con `reason: "fraude_o_enganio"` válido y resto del body válido | Se crea el reporte y la API responde éxito según contrato (`id`, `message`) | N/A |
| DRIFT_DB_CONSTRAINT | La BD tiene `reports_reason_check` desalineado con los motivos del contrato | La migración corrige el constraint para aceptar el conjunto canónico de motivos del backend | Si el deploy no aplicó migración, backend devuelve error de cliente controlado (no 500) con mensaje de validación de motivo |
| INVALID_REASON_INPUT | Body con `reason` fuera del enum público | Request rechazada en capa validator con 400 | Error de validación consistente (`Invalid request body`) |

</frozen-after-approval>

## Code Map

- `src/infrastructure/database/supabase/migrations/021-reports-schema.sql` -- definición original de `reports` y `reason` check.
- `src/infrastructure/database/supabase/report.repository.ts` -- inserción SQL en `reports`; punto de captura de errores de constraint.
- `src/domain/entities/report.entity.ts` -- unión tipada de motivos `ReportReason` (contrato de dominio).
- `src/interfaces/validators/report.validator.ts` -- enum de entrada para `POST /api/reports`.
- `src/openapi/schemas/report.schemas.ts` -- esquema OpenAPI expuesto para reportes.
- `tests/reports.create.test.ts` -- cobertura del endpoint público de creación (crear/ajustar según estructura existente).

## Tasks & Acceptance

**Execution:**
- [x] `src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql` -- recrear explícitamente `reports_reason_check` con el set canónico de motivos del backend para eliminar drift de constraints entre entornos -- evita rechazos falsos en inserción.
- [x] `src/infrastructure/database/supabase/report.repository.ts` -- capturar `23514` específico de `reports_reason_check` durante `create` y propagar excepción de dominio/HTTP de cliente en lugar de error interno -- elimina respuesta 500 por mismatch de constraint.
- [x] `src/domain/entities/report.entity.ts` + `src/interfaces/validators/report.validator.ts` + `src/openapi/schemas/report.schemas.ts` -- verificar y mantener consistencia del enum de motivos en dominio, validación y contrato público (sin divergencias) -- previene futuras desalineaciones.
- [x] `tests/reports-create.test.ts` (suite equivalente) -- cubrir creación exitosa con `fraude_o_enganio` y comportamiento controlado ante constraint mismatch -- garantiza regresión controlada del bug reportado.

**Acceptance Criteria:**
- Given un body válido de creación de reporte con `reason = fraude_o_enganio`, when el endpoint procesa la solicitud, then persiste el reporte sin violar `reports_reason_check` y responde según el contrato exitoso.
- Given un entorno con constraint desalineado no migrado, when el repositorio recibe `23514` por `reports_reason_check`, then la API responde error de cliente controlado y no un 500.
- Given el enum de motivos en dominio/validator/OpenAPI, when se revisan los artefactos de contrato, then el set de valores es idéntico en todas las capas.

## Spec Change Log

## Design Notes

El problema es un caso clásico de drift entre contrato aplicativo y constraint físico: el backend valida y acepta un valor que la BD rechaza, lo que estalla tarde (en persistencia) y termina en 500. El enfoque combina:

1. corrección estructural (migración que rehace el check canónico), y
2. defensa en profundidad (mapeo explícito de `23514`/`reports_reason_check` para no exponer errores internos al cliente).

Esto reduce impacto inmediato en UX y evita repetir el mismo patrón si reaparece drift por entornos legacy.

## Verification

**Commands:**
- `npm run db:migrate:dev` -- expected: migración de fix aplicada sin errores y constraint actualizado.
- `npm run test -- reports` -- expected: suite de reportes en verde incluyendo caso de creación con `fraude_o_enganio`.

## Suggested Review Order

**Persistencia y resiliencia del write path**

- Punto de entrada del fix: mapea violaciones `reason` a error de cliente.
  [`report.repository.ts:63`](../../src/infrastructure/database/supabase/report.repository.ts#L63)

- Garantiza fallback consistente con el código de error de dominio.
  [`report.repository.ts:68`](../../src/infrastructure/database/supabase/report.repository.ts#L68)

**Reparación de esquema en base de datos**

- Hace atómica la corrección del constraint para evitar estados intermedios inseguros.
  [`024-fix-reports-reason-check.sql:3`](../../src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql#L3)

- Elimina constraints legacy sobre columna `reason` antes de recrear el canónico.
  [`024-fix-reports-reason-check.sql:26`](../../src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql#L26)

- Define el constraint final `reports_reason_check` con el set contractual.
  [`024-fix-reports-reason-check.sql:33`](../../src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql#L33)

**Consistencia del contrato de motivos**

- Centraliza los motivos canónicos en una sola fuente tipada.
  [`report.entity.ts:3`](../../src/domain/entities/report.entity.ts#L3)

- Reutiliza el enum compartido en validación HTTP de entrada.
  [`report.validator.ts:6`](../../src/interfaces/validators/report.validator.ts#L6)

- Reutiliza el mismo enum en esquemas OpenAPI de reportes admin.
  [`report.schemas.ts:26`](../../src/openapi/schemas/report.schemas.ts#L26)

**Pruebas de regresión**

- Verifica éxito HTTP explícito con `fraude_o_enganio`.
  [`reports-create.test.ts:191`](../../tests/reports-create.test.ts#L191)

- Verifica que mismatch de constraint no escale a 500.
  [`reports-create.test.ts:416`](../../tests/reports-create.test.ts#L416)

- Verifica mapping de constraint canónico y legacy en repositorio.
  [`report-repository.test.ts:87`](../../tests/report-repository.test.ts#L87)
