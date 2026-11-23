---
project_name: backend
user_name: Emanuel
date: '2026-05-23'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: complete
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_Reglas críticas para implementar código en el backend de **Regálalo**. Detalle ampliado y diagramas: `docs/architecture.md` (v1.4). Artefactos BMAD en español._

---

## Technology Stack & Versions

| Componente | Versión / nota |
|---|---|
| Node.js | ES2022, `module`/`moduleResolution`: **NodeNext** |
| TypeScript | ^5.6.0, **strict: true** |
| Express | ^4.21.0 — prefijo API **`/api`** |
| PostgreSQL | `pg` ^8.13.0 — **sin ORM**, SQL explícito |
| Supabase | `@supabase/supabase-js` ^2.105.3 (DB + Storage) |
| Validación / OpenAPI | `zod` ^4.4.3 + `@asteasolutions/zod-to-openapi` ^8.5.0 |
| Auth | JWT 7d (`jsonwebtoken` ^9.0.3) + reCAPTCHA V3 |
| Hash | `argon2` ^0.44.0 |
| Email | `resend` ^6.12.2 |
| Caché | `lru-cache` ^11.3.5 (geocoding, etc.) |
| Seguridad HTTP | `helmet` ^8.0.0, `express-rate-limit` ^7.4.0 |
| Logging | `pino` ^9.5.0 — `appLogger` + `analyticsLogger` en `config/loggers.ts` (DLT-004) |
| Tests | `vitest` ^2.1.0, `supertest` ^7.0.0 |
| Dev / build | `tsx` ^4.19.0 — `npm run build` = OpenAPI + `tsc` |
| Jobs periódicos | **pg_cron** (SQL), no lógica crítica solo en Node |
| Hosting | Railway |

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- Importar `z` solo desde `src/zod.ts` (misma instancia que OpenAPI y validators).
- Excepciones de dominio en `domain/exceptions/`; el middleware `error-handler` las mapea a HTTP — no lanzar `Error` genérico desde use-cases.
- Tipos de retorno de use-cases: DTOs en `application/dtos/` — nunca entidades de dominio en respuestas HTTP.
- `GEOGRAPHY`/campo `location` de BD: **nunca** en DTOs de salida; solo métricas derivadas (p. ej. `distanceMeters` calculado en SQL).
- Prohibido `SELECT *` como fuente de respuesta API.

### Framework-Specific Rules (Express + Clean Architecture)

**Capas (no saltar):**

```
domain/          → entities, repository interfaces, domain exceptions
application/     → use-cases, services, dtos
infrastructure/  → supabase repos, email, storage, geocoding, security
interfaces/      → http (controllers, routes, middlewares), validators
```

- **Controladores:** orquestan únicamente — validar entrada (validator) → invocar use-case → mapear DTO a HTTP.
- **Use-cases:** toda lógica de negocio y **autorización a nivel de objeto (BOLA)**; el middleware `auth` solo valida JWT e inyecta `current_user`.
- **Repositorios:** interfaz en `domain/repositories/`; implementación en `infrastructure/database/supabase/`.
- Parámetros de ruta `:id` (item, session, user, request): validar **UUID v4** en `interfaces/validators/` antes del controlador → **400** genérico (SEC-007).
- Autorización fallida sobre recurso existente → **`ForbiddenException` (403)** con mensaje genérico; **nunca 404** para ocultar existencia del recurso.
- Transacciones multi-paso (cancel item, select receiver, confirm/cancel delivery, etc.): **una transacción atómica**; ver SEC-003/006 en `docs/architecture.md`.
- Jobs pg_cron: definir en **SQL/migraciones**; schedulers Node (`infrastructure/scheduler/`) solo para orquestación local/dev si aplica — no duplicar reglas críticas solo en Node.
- Schema de BD **cerrado** — no migrar ni alterar tablas sin aprobación explícita.

**Analítica (DLT-004):**

- `emitEvent` solo **después** de commit; fire-and-forget; fallo en log o insert BD no revierte negocio.
- **MVP:** dual-write — `analyticsLogger` (stdout) + tabla `analytics_events` (`ANALYTICS_PERSISTENCE=postgres` en prod).
- `userId` siempre hasheado (SHA-256) en logger y BD; prohibido PII en `properties`.
- Publicación de ítem exige `category` y `weightRange` (enums en `prd-analytics.md` §4).
- Catálogo AE-001…AE-033: `docs/architecture.md` §12.9 + `docs/PRD-REP-BE-01.md` §6 (AE-032, AE-033 — módulo reportes).

**JWT (SEC-004):**

- Claim `jwtVersion` debe coincidir con `users.jwt_version` en cada request autenticado.
- `reset-password`: incrementar `jwt_version` en la **misma transacción** que `password_hash`.

**OpenAPI (contrato con frontend):**

| Artefacto | Ruta |
|---|---|
| Spec generada | `openapi/openapi.json` |
| Esquemas fuente | `src/openapi/schemas/` |
| Regenerar | `npm run openapi:generate` (incluido en `npm run build`) |

Tras cambiar rutas o esquemas:

```bash
npm run openapi:generate
# luego en no-lo-vendo: npm run api:generate
```

Swagger UI solo si `NODE_ENV !== 'production'`: `/api/docs`, `/api/openapi.json`.

### Testing Rules

- Tests de integración HTTP en `tests/*.test.ts` con Vitest + Supertest.
- Patrón de nombres: `describe` / `it` referenciando ID de historia cuando exista (p. ej. `24.1 — sin autenticación → 401`).
- Mocks de repos/servicios con `vi.mock` / `vi.mocked`; env de test definido en `vitest.config.ts` — no depender de `.env` real.
- `LOG_LEVEL: silent` en tests; no asumir Supabase/Resend reales salvo test e2e explícito.
- Cubrir: 401 sin token, 403 BOLA, 400 UUID inválido, idempotencia donde aplique (p. ej. doble `confirm`).

### Code Quality & Style Rules

| Ámbito | Convención |
|---|---|
| Archivos | kebab-case |
| Clases | PascalCase |
| Funciones / variables | camelCase |
| Columnas BD | snake_case |
| Use-cases | `*.use-case.ts` en `application/use-cases/{dominio}/` |
| DTOs | `application/dtos/{accion}.dto.ts` |
| Validators | `interfaces/validators/{accion}.validator.ts` |

- Sin ESLint/Prettier obligatorio en repo — seguir patrones del código existente en la misma carpeta.
- Nuevos endpoints: esquema Zod en `src/openapi/schemas/`, validator, use-case, controller, ruta, test HTTP.

### Development Workflow Rules

- Variables de entorno: `config/env.ts` + `config/load-env.ts`; validar al arranque.
- `APP_ENV=dev` para remoto local (`npm run dev:remote`, `db:migrate:dev`).
- Migraciones: `npm run db:migrate` / `db:migrate:dev` — no editar historial de migraciones aplicadas.
- Commits/PR: solo cuando el usuario lo pida; no pushear sin solicitud.
- Documento de referencia por historia: `_bmad-output/implementation-artifacts/` y planning en `_bmad-output/planning-artifacts/`.
- **Versioning (obligatorio desde v1.0.0):** toda feature o fix debe añadir una entrada en `CHANGELOG.md` bajo `## [Unreleased]` con la sección correspondiente (`Added`, `Fixed`, `Security`, etc.) y bump de versión en `package.json` según semver (patch = bugfix, minor = feature, major = breaking). Al crear un tag/release: mover `[Unreleased]` a `## [X.Y.Z] - YYYY-MM-DD` y limpiar `[Unreleased]`. Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

### Critical Don't-Miss Rules

**Prohibido para agentes:**

- ORM o query builders que oculten SQL.
- Serializar entidades de dominio o filas crudas en JSON.
- Autorización solo en rutas sin verificar `donor_id` / participación en el use-case.
- Exponer `contact_channel` al donante en GET session (él ya lo conoce); al receptor solo bajo SEC-002.
- Exponer email/teléfono/`consecutiveNoShows` en `otherParty` del DTO de sesión.
- Implementar ranking/candidatos sin verificar `item.donor_id === current_user.id` (SEC-001).
- Permitir `POST /items/:id/requests` si `requester === donor` (verificar antes del límite 30d).
- `SELECT *` o filtrar por `:id` sin validar UUID.
- Modificar `openapi/openapi.json` a mano — siempre regenerar.
- Editar el cliente generado del frontend (`no-lo-vendo/.../generated/`).

**Autorización resumida (detalle en `docs/architecture.md` §12):**

| Use-case | Regla clave |
|---|---|
| Get ranked candidates | Solo donante del ítem |
| Get delivery session | Solo donor o receiver; `contactChannel` solo receiver + active + no purged |
| Cancel item | Solo donante; cancelar sesión activa en misma TX |
| Request item | `donor_id !== requester_id` |
| Select receiver | Donante + request pertenece al ítem; TX atómica |
| Confirm / cancel delivery | Solo donante; estados e idempotencia según doc |
| Pause item | Solo donante; ítem `active` |

**Seguridad HTTP (SEC-009/010):** rate limits globales + auth + ranking; Helmet configurado en app — no desactivar sin revisión.

**Rendimiento:** geocoding vía Nominatim con LRU; respetar política de reCAPTCHA en `recaptcha-policy.ts`.

---

## Usage Guidelines

**Para agentes IA:**

1. Leer este archivo y `docs/architecture.md` antes de implementar.
2. Ante duda, elegir la opción **más restrictiva** (seguridad, autorización, DTOs).
3. Tras cambios de API, regenerar OpenAPI y avisar si el frontend debe ejecutar `api:generate`.
4. Actualizar este archivo si emerge un patrón nuevo no obvio.

**Para humanos:**

- Mantener el archivo **breve**; mover detalle narrativo a `docs/architecture.md`.
- Revisar cuando cambie `package.json` o reglas SEC.
- El frontend tiene su propio `_bmad-output/project-context.md` en `no-lo-vendo`.

**Last Updated:** 2026-05-23
