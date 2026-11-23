# Regálalo — Backend

API REST en Node.js + Express (Clean Architecture).

## Requisitos

- Node.js 20+
- PostgreSQL (Supabase) y variables en `.env` (ver `src/config/env.ts`)

## Desarrollo

```bash
npm install
cp .env.example .env   # ajusta DATABASE_URL, JWT_SECRET, etc.
npm run db:migrate     # crea tablas (omite jobs pg_cron si no están disponibles)
npm run dev            # http://localhost:3000
```

### Storage en local

Si Supabase Storage no está configurado o devuelve `fetch failed`, usa almacenamiento en disco:

```env
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=.storage
```

Las imágenes se sirven en `GET /api/storage/<storage_path>` (p. ej. `/api/storage/items/.../foto.webp`).

Las rutas de la API viven bajo **`/api`** (ejemplo: `GET /api/health`).

## Logging

Pino (JSON en stdout), niveles con `LOG_LEVEL`, peticiones HTTP con `pino-http`. Guía completa: [`docs/logging.md`](docs/logging.md).

## OpenAPI / Swagger

```bash
npm run openapi:generate   # genera openapi/openapi.json
```

Con el servidor en modo desarrollo:

- **Swagger UI:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs) (alias: `/api-docs`)
- **Spec JSON:** [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)

En producción no se monta Swagger UI; el fichero `openapi/openapi.json` se genera en `npm run build`.

## Cliente Angular

Desde el repo del frontend (`no-lo-vendo`):

```bash
npm run api:generate
```

Regenerar siempre que cambie el contrato en este backend.

## Tests

```bash
npm test
```
