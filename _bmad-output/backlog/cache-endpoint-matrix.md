# Matriz endpoint → caché

Auditoría alineada con `src/openapi/register-paths.ts` y rutas adicionales en `src/app.ts`.  
**LRU geocoding:** solo rutas que invocan `IGeocodingService.geocode()` vía `NominatimAdapter` compartido en `routes/index.ts`.  
**OpenAPI doc:** caché en memoria al generar el documento (`generateOpenApiDocument`), no por request HTTP de negocio.

| Método | Path | LRU geocoding | OpenAPI doc cache | HTTP Cache-Control | Notas |
|--------|------|:-------------:|:-----------------:|--------------------|-------|
| GET | `/health` | — | — | `no-cache` | Sin PII |
| POST | `/auth/register` | Sí | — | `no-store` | Geocode en registro |
| POST | `/auth/login` | — | — | `no-store` | |
| POST | `/auth/forgot-password` | — | — | `no-store` | |
| POST | `/auth/reset-password` | — | — | `no-store` | |
| GET | `/items` | — | — | `no-store` | Lista con JWT |
| POST | `/items` | Sí | — | `no-store` | Geocode al publicar |
| GET | `/items/{id}` | — | — | `no-store` | |
| DELETE | `/items/{id}` | — | — | `no-store` | |
| PATCH | `/items/{id}/pause` | — | — | `no-store` | |
| GET | `/items/{id}/requests` | — | — | `no-store` | Ranking donante |
| POST | `/items/{id}/requests` | — | — | `no-store` | |
| POST | `/items/{id}/requests/{requestId}/select` | — | — | `no-store` | |
| GET | `/users/me` | — | — | `no-store` | Perfil privado |
| GET | `/users/me/reputation-history` | — | — | `no-store` | |
| GET | `/users/me/delivery-sessions` | — | — | `no-store` | |
| GET | `/users/me/items` | — | — | `no-store` | |
| GET | `/users/me/requests` | — | — | `no-store` | |
| GET | `/users/{id}` | — | — | `no-store` | Perfil público |
| GET | `/delivery-sessions/{id}` | — | — | `no-store` | |
| POST | `/delivery-sessions/{id}/confirm` | — | — | `no-store` | |
| POST | `/delivery-sessions/{id}/cancel` | — | — | `no-store` | |
| GET | `/openapi.json` | — | Sí (generación) | `no-store` | Solo `NODE_ENV !== production` |
| GET | `/docs` | — | Sí (setup UI) | `no-store` | Swagger UI dev |
| GET | `/storage/*` | — | — | `public, max-age=86400` | Solo `STORAGE_DRIVER=local` |

**Instancia LRU:** una sola `NominatimAdapter` en `src/interfaces/http/routes/index.ts` (max 500, TTL 7 días, clave `country:postalCode`).
