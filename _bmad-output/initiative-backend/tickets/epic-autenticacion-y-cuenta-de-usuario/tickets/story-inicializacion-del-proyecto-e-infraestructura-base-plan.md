---
title: "Inicialización del proyecto e infraestructura base"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 1.1: Inicialización del proyecto e infraestructura base

Status: done

## Historia

Como desarrollador,
quiero que el proyecto tenga la estructura Clean Architecture correcta, el servidor Express configurado y todos los middlewares globales en su lugar,
para que todas las historias siguientes puedan implementarse dentro de una base técnica coherente.

## Criterios de Aceptación

1. El servidor Express arranca en el puerto configurado por variable de entorno y responde `200 OK` en `GET /health`.
2. Existe la estructura de carpetas Clean Architecture completa: `src/domain/`, `src/application/use-cases/`, `src/application/services/`, `src/application/dtos/`, `src/infrastructure/`, `src/interfaces/http/controllers/`, `src/interfaces/http/middlewares/`, `src/interfaces/http/routes/`, `src/interfaces/validators/`, `src/config/`, `src/main.ts`.
3. Los logs se emiten en formato JSON via pino con nivel configurable por variable de entorno.
4. Las respuestas incluyen `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` y `Referrer-Policy: no-referrer` (Helmet.js).
5. Una IP que supera 60 peticiones en 60 segundos recibe `429 Too Many Requests`.
6. Una IP que supera 10 peticiones en 15 minutos a rutas `/auth/*` recibe `429 Too Many Requests`.
7. Una ruta con parámetro `:id` no UUID v4 recibe `400 Bad Request` antes de llegar al controlador.

## Tareas / Subtareas

- [x] Tarea 1 — Inicializar proyecto Node.js + TypeScript (AC: #2)
  - [x] 1.1 Crear `package.json` con todas las dependencias (ver Dev Notes §Dependencias)
  - [x] 1.2 Crear `tsconfig.json` con `strict: true`, `module: NodeNext`, `target: ES2022`
  - [x] 1.3 Crear `.env.example` con todas las variables de entorno requeridas (ver Dev Notes §Variables de entorno)
  - [x] 1.4 Crear `.gitignore` (node_modules, dist, .env)
  - [x] 1.5 Crear la estructura de carpetas Clean Architecture completa (todos los directorios vacíos con `.gitkeep`)

- [x] Tarea 2 — Configurar Express con middlewares globales (AC: #1, #3, #4, #5, #6)
  - [x] 2.1 Crear `src/config/env.ts`: parse y validación de variables de entorno con tipos explícitos
  - [x] 2.2 Crear `src/interfaces/http/middlewares/rate-limit.ts`: `globalRateLimit` y `authRateLimit` (NO incluir `rankingRateLimit` — es Historia 3.2)
  - [x] 2.3 Crear `src/interfaces/http/middlewares/error-handler.ts`: middleware de errores global Express (4 parámetros: `err, req, res, next`)
  - [x] 2.4 Crear `src/main.ts`: Express app con Helmet, CORS, pino-http, rate limiting, body parser, rutas y error handler
  - [x] 2.5 Crear `src/interfaces/http/routes/index.ts`: barrel que monta todas las rutas

- [x] Tarea 3 — Implementar validación UUID para rutas (AC: #7)
  - [x] 3.1 Crear `src/interfaces/validators/uuid-param.validator.ts`: middleware factory `validateUuidParam(paramName: string)`
  - [x] 3.2 Verificar que retorna HTTP 400 con mensaje genérico si el parámetro no es UUID v4

- [x] Tarea 4 — Configurar endpoint GET /health y conexión a DB (AC: #1)
  - [x] 4.1 Crear `src/infrastructure/database/supabase/db.ts`: `pg.Pool` exportado como singleton (lazy connect — sin verificar conexión en este paso)
  - [x] 4.2 Crear `src/interfaces/http/routes/health.routes.ts`: `GET /health` responde `{ status: "ok" }` con HTTP 200
  - [x] 4.3 Crear `vitest.config.ts` con configuración de tests

- [x] Tarea 5 — Tests (AC: todos)
  - [x] 5.1 Test: servidor arranca y `GET /health` responde 200
  - [x] 5.2 Test: respuesta incluye cabeceras Helmet (`strict-transport-security`, `x-content-type-options`, `x-frame-options`, `referrer-policy`)
  - [x] 5.3 Test: UUID v4 válido en ruta con `:id` → pasa al handler siguiente
  - [x] 5.4 Test: UUID inválido en ruta con `:id` → 400 Bad Request
  - [x] 5.5 Test: rate limit global retorna 429 al superar 60 req/60s (configuración de test con límite bajo: max 2)

## Dev Notes

### Stack obligatorio

- **Runtime:** Node.js (versión ≥ 20 LTS)
- **Lenguaje:** TypeScript con `strict: true` — sin excepciones
- **Framework HTTP:** Express **4.x** (NO usar v5, está en beta inestable)
- **Logger:** pino + pino-http — NO winston, NO morgan, NO console.log en producción
- **Tests:** Vitest + supertest — NO Jest (Vitest tiene mejor soporte ESM/TypeScript nativo)

### Dependencias exactas

**Runtime (`dependencies`):**
```json
{
  "express": "^4.21.0",
  "helmet": "^8.0.0",
  "cors": "^2.8.5",
  "express-rate-limit": "^7.4.0",
  "pino": "^9.5.0",
  "pino-http": "^10.3.0",
  "pg": "^8.13.0",
  "dotenv": "^16.4.0"
}
```

**Dev (`devDependencies`):**
```json
{
  "typescript": "^5.6.0",
  "@types/express": "^5.0.0",
  "@types/node": "^22.0.0",
  "@types/pg": "^8.11.0",
  "@types/cors": "^2.8.17",
  "tsx": "^4.19.0",
  "vitest": "^2.1.0",
  "@vitest/coverage-v8": "^2.1.0",
  "supertest": "^7.0.0",
  "@types/supertest": "^6.0.0"
}
```

Scripts recomendados en `package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Estructura de carpetas obligatoria

Exactamente como especifica `docs/architecture.md §2`:

```
src/
├── domain/
│   ├── entities/
│   ├── repositories/
│   └── value-objects/
├── application/
│   ├── use-cases/
│   │   ├── user/
│   │   ├── item/
│   │   └── delivery/
│   ├── services/
│   └── dtos/
├── infrastructure/
│   ├── database/
│   │   ├── supabase/      ← pool de pg va aquí
│   │   └── cache/
│   ├── email/
│   ├── storage/
│   ├── geocoding/
│   └── security/
├── interfaces/
│   ├── http/
│   │   ├── controllers/
│   │   ├── middlewares/   ← rate-limit.ts, error-handler.ts
│   │   └── routes/        ← health.routes.ts, index.ts
│   └── validators/        ← uuid-param.validator.ts
├── config/                ← env.ts
└── main.ts
```

### Configuración Helmet (EXACTA — docs/architecture.md §11.2)

```typescript
// src/main.ts
import helmet from 'helmet';

app.use(helmet({
  hsts: {
    maxAge: 31536000,       // 1 año
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: false, // Gestionado por Angular/Vercel en frontend
}));
```

### Configuración Rate Limiting (EXACTA — docs/architecture.md §11.1)

```typescript
// src/interfaces/http/middlewares/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,         // 60 segundos
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// ⚠️ NO crear rankingRateLimit aquí — es Historia 3.2
```

Aplicación en `main.ts`:
```typescript
app.use(globalRateLimit);           // aplica a TODAS las rutas
app.use('/auth', authRateLimit);    // aplica SOLO a /auth/*
```

### Validador UUID (src/interfaces/validators/uuid-param.validator.ts)

```typescript
import { Request, Response, NextFunction } from 'express';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (!value || !UUID_V4_REGEX.test(value)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }
    next();
  };
}
```

Uso en rutas (a implementar en historias futuras):
```typescript
router.get('/:id', validateUuidParam('id'), controller.getById);
```

### Pool de base de datos (src/infrastructure/database/supabase/db.ts)

```typescript
import { Pool } from 'pg';
import { env } from '../../config/env';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});
```

El pool NO intenta conectarse hasta que se ejecuta la primera query. No verificar la conexión en esta historia.

### Variables de entorno (.env.example)

```dotenv
# Servidor
PORT=3000
NODE_ENV=development

# Base de datos (Supabase PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT (Historia 1.2)
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=7d

# reCAPTCHA (Historia 1.2)
RECAPTCHA_SECRET_KEY=your-recaptcha-secret

# Email — Resend (Historia 1.2)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM=equipo@yourdomain.com

# Geocodificación (Historia 1.2)
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org

# Log
LOG_LEVEL=info
```

### src/config/env.ts — parse tipado de variables

```typescript
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  NODE_ENV: (process.env['NODE_ENV'] ?? 'development') as 'development' | 'production' | 'test',
  DATABASE_URL: required('DATABASE_URL'),
  LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
  // Las siguientes se añadirán en historias posteriores:
  // JWT_SECRET, RECAPTCHA_SECRET_KEY, RESEND_API_KEY, etc.
} as const;
```

### Configuración de tests (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

Para tests de Express con supertest, exportar `app` sin llamar a `app.listen()`:

```typescript
// src/main.ts — exportar app SIN llamar listen()
export { app };

// src/server.ts (o al final de main.ts) — solo para producción
import { app } from './main';
import { env } from './config/env';
app.listen(env.PORT, () => { ... });
```

O alternativamente, separar en `src/app.ts` (crea la app) y `src/main.ts` (llama listen). El agente elige la estructura que le resulte más limpia.

### Lo que NO debe implementarse en esta historia

- ❌ Tablas de base de datos — se crean en la historia que las necesita (1.2 para `users`)
- ❌ JWT / autenticación — Historia 1.4
- ❌ reCAPTCHA — Historia 1.2
- ❌ Email / Resend — Historia 1.2
- ❌ Geocodificación / Nominatim — Historia 1.2
- ❌ `rankingRateLimit` — Historia 3.2
- ❌ Cualquier controlador o use case de dominio

### Notas de arquitectura transversales

- **DTOs explícitos:** Todos los use cases (en historias futuras) deben retornar DTOs definidos en `application/dtos/`. Esta historia establece la carpeta pero no crea ningún DTO.
- **Sin ORM:** Todas las queries serán SQL directo via `pg`. El pool en `infrastructure/database/supabase/db.ts` es la única interfaz con la BD.
- **Errores:** El error handler global en `interfaces/http/middlewares/error-handler.ts` debe capturar errores no manejados y retornar respuestas consistentes. Para esta historia: genérico `{ message: 'Internal server error' }` con 500.
- **Convenciones de nombres:** kebab-case para archivos, PascalCase para clases, camelCase para funciones y variables.

### Notas del contexto Git

- Repositorio con 2 commits — limpio y sin código de aplicación
- El commit `80e3cd4` eliminó documentos técnicos obsoletos
- No hay código existente que preservar — es greenfield completo

### Referencias

- Configuración Helmet: [Source: docs/architecture.md §11.2]
- Configuración Rate Limiting: [Source: docs/architecture.md §11.1]
- Estructura de carpetas: [Source: docs/architecture.md §2]
- Validación UUID (NFR3): [Source: docs/architecture.md §2 — "Regla de implementación — Validación UUID (SEC-007)"]
- Stack tecnológico: [Source: docs/architecture.md §1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Error TS2345 en `uuid-param.validator.ts`: `req.params[paramName]` tipado como `string | string[]` en `@types/express ^5.0.0`. Resuelto usando type guard `typeof value !== 'string'` en lugar de acceso directo al regex.
- Separación `src/app.ts` + `src/main.ts`: la historia permitía esta alternativa; se eligió por limpieza en tests (supertest importa `app` sin llamar a `listen()`).

### Completion Notes List

- Estructura Clean Architecture completa creada con `.gitkeep` en todos los directorios vacíos.
- `src/app.ts` contiene toda la configuración Express (Helmet, CORS, pino-http, rate limit, rutas, error handler). `src/main.ts` solo llama a `listen()`.
- `vitest.config.ts` setea `DATABASE_URL`, `NODE_ENV=test`, `PORT=3001` y `LOG_LEVEL=silent` via `test.env` para que `env.ts` no falle al importarse en tests.
- 6 tests pasan: GET /health 200, 4 headers Helmet (incluyendo HSTS), UUID válido OK, UUID inválido 400, string no-v4 400, rate limit 429 con configuración reducida (max: 2).
- TypeScript compila sin errores (`tsc --noEmit` limpio).

### File List

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.env.example`
- `src/app.ts`
- `src/main.ts`
- `src/config/env.ts`
- `src/interfaces/http/middlewares/rate-limit.ts`
- `src/interfaces/http/middlewares/error-handler.ts`
- `src/interfaces/http/routes/index.ts`
- `src/interfaces/http/routes/health.routes.ts`
- `src/interfaces/validators/uuid-param.validator.ts`
- `src/infrastructure/database/supabase/db.ts`
- `src/domain/entities/.gitkeep`
- `src/domain/repositories/.gitkeep`
- `src/domain/value-objects/.gitkeep`
- `src/application/use-cases/user/.gitkeep`
- `src/application/use-cases/item/.gitkeep`
- `src/application/use-cases/delivery/.gitkeep`
- `src/application/services/.gitkeep`
- `src/application/dtos/.gitkeep`
- `src/infrastructure/database/cache/.gitkeep`
- `src/infrastructure/email/.gitkeep`
- `src/infrastructure/storage/.gitkeep`
- `src/infrastructure/geocoding/.gitkeep`
- `src/infrastructure/security/.gitkeep`
- `src/interfaces/http/controllers/.gitkeep`
- `tests/health.test.ts`
- `tests/uuid-validator.test.ts`
- `tests/rate-limit.test.ts`

### Change Log

- Implementación inicial de infraestructura base: Express + Helmet + CORS + pino-http + rate limiting + validación UUID + GET /health (2026-05-04)

### Review Findings

- [x] [Review][Decision] CORS via env.CORS_ORIGIN — resuelto: usar variable de entorno CORS_ORIGIN con default http://localhost:4200 — aplicado

- [x] [Review][Patch] Error handler silencia el error completamente — tipo debe ser `unknown` (no `Error`), falta log del error, falta guarda `if (res.headersSent) return` [src/interfaces/http/middlewares/error-handler.ts:3-4] — aplicado
- [x] [Review][Patch] Pool de BD sin handler de eventos de error — falta `db.on('error', ...)`, un evento no manejado crashea el proceso Node.js [src/infrastructure/database/supabase/db.ts:4-7] — aplicado
- [x] [Review][Patch] `required()` acepta cadena vacía — `!value` no detecta `DATABASE_URL=""`, string vacío pasa la validación [src/config/env.ts:4-5] — aplicado
- [x] [Review][Patch] PORT no-numérico produce NaN — `parseInt('abc', 10)` devuelve NaN sin validación, `app.listen(NaN)` silencioso [src/config/env.ts:10] — aplicado
- [x] [Review][Patch] Error de `app.listen()` silenciado — falta `.on('error', handler)` en el servidor HTTP [src/main.ts:7] — aplicado
- [x] [Review][Patch] @types/express ^5.0.0 con runtime Express 4.x — mismatch de API de tipos [package.json] — aplicado: bajado a ^4.17.21
- [x] [Review][Defer] `tests/` excluido de tsconfig.json — fix requiere cambiar rootDir; incompatible con estructura actual src/dist [tsconfig.json] — deferred: needs rootDir refactor
- [x] [Review][Defer] package.json sin `"type": "module"` — fix requiere migrar todos los imports a extensión .js; decisión arquitectónica [package.json] — deferred: needs ESM migration

- [x] [Review][Defer] Sin handler de cierre graceful — sin SIGTERM/SIGINT, sin `server.close()`, sin `db.end()` [src/main.ts] — deferred, pre-existing
- [x] [Review][Defer] Dos instancias pino independientes — `app.ts` y `main.ts` crean instancias separadas sin parent compartido [src/app.ts + src/main.ts] — deferred, pre-existing
- [x] [Review][Defer] Rate limiting en memoria por instancia — store se resetea en cada reinicio; problemático en multi-instancia [src/interfaces/http/middlewares/rate-limit.ts] — deferred, pre-existing
- [x] [Review][Defer] LOG_LEVEL sin validar contra valores pino — string libre puede producir comportamiento inesperado en producción [src/config/env.ts:13] — deferred, pre-existing
- [x] [Review][Defer] package.json sin campo "engines" — no declara versión mínima de Node.js requerida [package.json] — deferred, pre-existing
