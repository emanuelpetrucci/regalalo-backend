---
title: 'Validar caché en todos los endpoints'
type: feature
created: 2026-10-25
status: done
baseline_commit: '274b2abc4fe0612d2c397663d9649aeddb3cb7b2'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/architecture.md'
ticket: "story-validar-cache-endpoints"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No hay inventario verificable de qué cachés aplican a cada ruta HTTP. La LRU de geocodificación está fragmentada (dos instancias de `NominatimAdapter` en runtime) y no existe política explícita de `Cache-Control` en respuestas API — riesgo de datos sensibles cacheados por proxies/navegador y de llamadas redundantes a Nominatim.

**Approach:** Definir una matriz canónica endpoint → tipo de caché (LRU geocoding / OpenAPI doc / HTTP), corregir el wiring para una LRU compartida, aplicar middleware global de cabeceras HTTP según política, y cubrir con tests automatizados + matriz versionada en el repo.

## Boundaries & Constraints

**Always:**
- Clean Architecture: middleware en `interfaces/http/middlewares/`; LRU solo en `NominatimAdapter`.
- NFR12: LRU max 500, TTL 7 días, clave `country:postalCode`.
- APIs autenticadas con JWT/PII: **nunca** `public` ni `max-age` > 0 sin `private`.
- Helmet (NFR7/SEC-010) sigue activo; no desactivar.
- Tests Vitest + Supertest; no tocar `openapi/openapi.json` a mano.
- Matriz en `_bmad-output/backlog/cache-endpoint-matrix.md` (artefacto de auditoría).

**Ask First:**
- Cambiar `max-age` de `/api/storage/*` si el producto exige invalidación inmediata al borrar imagen.
- Añadir `Vary: Authorization` explícito (recomendado pero no obligatorio en MVP si todo es `no-store`).

**Never:**
- Cachear respuestas JSON de endpoints con `Authorization` en CDN/proxy compartido.
- Nuevo Redis/Memcached o caché de respuestas de ranking/listados (fuera de alcance MVP).
- Modificar schema de BD.
- Editar cliente Angular generado.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Geocode miss | postalCode nuevo | 1 fetch Nominatim; resultado en LRU | GeocodingException → 422/400 según flujo |
| Geocode hit (misma instancia) | mismo `es:28001` dos veces | 1 fetch total; segunda desde LRU | N/A |
| Geocode cross-route | register 28001 luego publish 28001 | 1 fetch total (LRU compartida) | N/A |
| API autenticada | GET/POST/PATCH/DELETE `/api/*` con Bearer | `Cache-Control: no-store` (y sin ETag de caché de respuesta) | N/A |
| Health | GET `/api/health` | `Cache-Control: no-cache` | N/A |
| OpenAPI dev | GET `/api/openapi.json` | `Cache-Control: no-store` | 404 en production (ruta no montada) |
| Storage local | GET `/api/storage/...` imagen | `Cache-Control: public, max-age=86400` | 404 archivo inexistente |
| OpenAPI generator | dos llamadas `generateOpenApiDocument()` | misma instancia en memoria (cache doc) | N/A |

</frozen-after-approval>

## Code Map

- `src/infrastructure/geocoding/nominatim.adapter.ts` — LRU geocoding (única implementación)
- `src/interfaces/http/routes/index.ts` — composition root: inyectar **una** instancia compartida de geocoding
- `src/interfaces/http/routes/auth.routes.ts` — `POST /register` usa geocoding
- `src/interfaces/http/routes/items.routes.ts` — `POST /items` usa geocoding
- `src/openapi/document.ts` — caché del documento OpenAPI
- `src/interfaces/http/routes/openapi.routes.ts` — sirve doc en dev
- `src/app.ts` — Helmet global; montar middleware de cache **después** de helmet, antes de rutas
- `src/openapi/register-paths.ts` — lista canónica de paths para la matriz
- `tests/auth-register.test.ts` — test LRU duplicado inline (reemplazar por test del adapter)
- `_bmad-output/backlog/cache-endpoint-matrix.md` — **crear** matriz auditoría

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/backlog/cache-endpoint-matrix.md` -- crear matriz (método, path, LRU geocoding, OpenAPI doc cache, política HTTP, notas) para los 22 paths de `register-paths.ts` + `/api/storage/*` + rutas OpenAPI dev -- artefacto de validación
- [x] `src/interfaces/http/routes/index.ts` -- instanciar `geocodingService` una vez y pasarla a `createAuthRouter` / `createItemRouter` (dejar de exportar routers sin deps compartidas o recrear en index) -- LRU compartida cross-route
- [x] `src/interfaces/http/middlewares/http-cache.middleware.ts` -- middleware con reglas por prefijo (`/api/storage` → public; `/api/health` → no-cache; resto `/api` → no-store) -- política HTTP explícita
- [x] `src/app.ts` -- `app.use(httpCacheMiddleware)` en orden correcto -- aplicar política global
- [x] `tests/infrastructure/nominatim.adapter.test.ts` -- tests del adapter real: hit/miss, max 500 no eviction en test pequeño, fetch mock -- sustituye lógica duplicada en auth-register
- [x] `tests/auth-register.test.ts` -- eliminar bloque `describe('NominatimAdapter — LRU Cache unitario')` duplicado; opcional test integración que spy en instancia compartida si se inyecta en app test -- evitar drift
- [x] `tests/http-cache-headers.test.ts` -- supertest: muestra representativa (health, users/me con auth mock o app test helper, storage si aplica, openapi.json en NODE_ENV test) assert `cache-control` -- validación HTTP
- [x] `tests/geocoding-shared-cache.test.ts` -- dos requests register+publish mismo postal con fetch mock global: **1** llamada Nominatim -- prueba cross-route

**Acceptance Criteria:**
- Given la matriz generada, when se revisa cada fila, then coincide con el código y tests (sin endpoints huérfanos respecto a OpenAPI).
- Given dos geocodificaciones del mismo código postal vía register y publish, when se ejecutan en la misma app, then Nominatim recibe una sola petición HTTP.
- Given `GET /api/users/me` autenticado, when responde 200, then `Cache-Control` incluye `no-store`.
- Given `GET /api/health`, when responde 200, then `Cache-Control` es `no-cache` (sin almacenar respuestas sensibles).
- Given `npm test`, when termina, then todos los tests nuevos y existentes pasan.

## Verification

**Commands:**
- `npm test` -- expected: suite verde, incl. `nominatim.adapter.test.ts`, `http-cache-headers.test.ts`, `geocoding-shared-cache.test.ts`
- `npm run build` -- expected: compila sin errores TS

**Manual checks (if no CLI):**
- Abrir `cache-endpoint-matrix.md` y contrastar con Swagger `/api/docs` en dev.

## Suggested Review Order

**Política HTTP global**

- Middleware fija `Cache-Control` por prefijo antes de rutas API.
  [`http-cache.middleware.ts:8`](../../src/interfaces/http/middlewares/http-cache.middleware.ts#L8)

- Montaje global tras rate limit y antes de routers.
  [`app.ts:32`](../../src/app.ts#L32)

**LRU geocoding compartida**

- Una sola instancia de Nominatim inyectada en auth e items.
  [`index.ts:13`](../../src/interfaces/http/routes/index.ts#L13)

- Implementación LRU (500 entradas, TTL 7d).
  [`nominatim.adapter.ts:9`](../../src/infrastructure/geocoding/nominatim.adapter.ts#L9)

**Auditoría y pruebas**

- Matriz canónica endpoint → tipo de caché.
  [`cache-endpoint-matrix.md:7`](cache-endpoint-matrix.md#L7)

- Cross-route register + publish comparten LRU.
  [`geocoding-shared-cache.test.ts:54`](../../tests/geocoding-shared-cache.test.ts#L54)

- Cabeceras HTTP en health, OpenAPI y users/me.
  [`http-cache-headers.test.ts:53`](../../tests/http-cache-headers.test.ts#L53)

- Tests unitarios del adapter (sustituyen duplicado en auth-register).
  [`nominatim.adapter.test.ts:20`](../../tests/infrastructure/nominatim.adapter.test.ts#L20)
