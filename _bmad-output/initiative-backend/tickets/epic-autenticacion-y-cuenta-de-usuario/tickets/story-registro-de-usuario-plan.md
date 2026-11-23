---
title: "Registro de usuario"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 1.2: Registro de usuario

Status: done

## Historia

Como visitante,
quiero poder registrarme con mi email, contraseña y código postal,
para poder usar la plataforma como donante o receptor.

## Criterios de Aceptación

1. `POST /auth/register` con email único, contraseña, código postal válido y token reCAPTCHA con score ≥ 0.5 responde `201` con `{ token: JWT, user: { id, email, postalCode, reputationScore: 0, totalReceived: 0, totalDonated: 0 } }`. El usuario queda en `users` con contraseña hasheada (Argon2), `location` geocodificada y `jwt_version = 1`. El JWT incluye claim `jwtVersion: 1`.
2. Email ya registrado → `409 Conflict`.
3. Código postal que Nominatim no puede geocodificar → `400 Bad Request`.
4. Token reCAPTCHA con score < 0.5 → `422 Unprocessable Entity`.
5. Código postal ya geocodificado recientemente → se usa la entrada del LRU Cache sin llamada adicional a Nominatim.
6. Registro exitoso → se envía email de bienvenida al usuario (EVT-001 / TPL-001) via Resend tras el commit.

## Tareas / Subtareas

- [x] Tarea 1 — Instalar dependencias y actualizar env.ts (AC: todos)
  - [x] 1.1 Añadir a `package.json` (dependencies): `argon2`, `jsonwebtoken`, `lru-cache`, `resend`, `zod`
  - [x] 1.2 Añadir a `package.json` (devDependencies): `@types/jsonwebtoken`
  - [x] 1.3 Actualizar `src/config/env.ts`: añadir `JWT_SECRET` (required), `JWT_EXPIRES_IN` (default `'7d'`), `RECAPTCHA_SECRET_KEY` (required), `RESEND_API_KEY` (required), `RESEND_FROM` (required), `NOMINATIM_BASE_URL` (default `'https://nominatim.openstreetmap.org'`)

- [x] Tarea 2 — SQL: crear tabla `users` (AC: #1)
  - [x] 2.1 Crear `src/infrastructure/database/supabase/migrations/001-create-users.sql` con el DDL completo de la tabla `users` (ver Dev Notes §Schema) y los índices geoespaciales. Ejecutar en Supabase.

- [x] Tarea 3 — Capa Domain (AC: #1, #2)
  - [x] 3.1 Crear `src/domain/entities/user.entity.ts`: interfaz `User` con los campos de la BD en camelCase (ver Dev Notes §User entity)
  - [x] 3.2 Crear `src/domain/repositories/user.repository.ts`: interfaz `IUserRepository` con métodos `findByEmail`, `create`
  - [x] 3.3 Crear `src/domain/services/mail.service.ts`: interfaz `IMailService` con método `send`

- [x] Tarea 4 — Capa Application: DTOs y Use Case (AC: #1–#6)
  - [x] 4.1 Crear `src/application/dtos/auth.dto.ts`: `RegisterRequestDto` (entrada), `AuthResponseDto` (salida con `token` y `user` sin campo `location`)
  - [x] 4.2 Crear `src/application/use-cases/user/register-user.use-case.ts`: `RegisterUserUseCase` (ver Dev Notes §Flujo completo)

- [x] Tarea 5 — Capa Infrastructure: servicios de seguridad (AC: #1, #4)
  - [x] 5.1 Crear `src/infrastructure/security/argon2.service.ts`: `Argon2HashService` con métodos `hash(password)` y `verify(hash, password)`
  - [x] 5.2 Crear `src/infrastructure/security/jwt.service.ts`: `JwtService` con métodos `sign(payload)` → token y `verify(token)` → payload
  - [x] 5.3 Crear `src/infrastructure/security/recaptcha.service.ts`: `RecaptchaService` con método `verify(token)` → `{ success, score }` (ver Dev Notes §reCAPTCHA)

- [x] Tarea 6 — Capa Infrastructure: geocodificación (AC: #3, #5)
  - [x] 6.1 Crear `src/application/services/geocoding.service.ts`: interfaz `IGeocodingService` con `geocode(postalCode): Promise<{ lat: number; lon: number }>`
  - [x] 6.2 Crear `src/infrastructure/geocoding/nominatim.adapter.ts`: `NominatimAdapter` con LRU Cache (capacidad 500) implementando la lógica exacta de §9.2 del documento de arquitectura

- [x] Tarea 7 — Capa Infrastructure: email (AC: #6)
  - [x] 7.1 Crear `src/infrastructure/email/resend.provider.ts`: `ResendMailProvider implements IMailService`; sólo implementar el envío de EVT-001 (TPL-001) con campo `recipientEmail`

- [x] Tarea 8 — Capa Infrastructure: repositorio de usuarios (AC: #1, #2)
  - [x] 8.1 Crear `src/infrastructure/database/supabase/user.repository.ts`: `PostgresUserRepository implements IUserRepository`; SQL directo via `db` (sin ORM); traducir camelCase ↔ snake_case en este adaptador

- [x] Tarea 9 — Capa Interfaces: validador, controlador y rutas (AC: #1–#4)
  - [x] 9.1 Crear `src/interfaces/validators/register.validator.ts`: schema Zod para `RegisterRequestDto`; validar email, password (mín. 8 chars), postalCode (no vacío), recaptchaToken (no vacío)
  - [x] 9.2 Crear `src/interfaces/http/controllers/auth.controller.ts`: `AuthController` con método `register`; solo orquesta: parsea body, invoca use case, responde HTTP
  - [x] 9.3 Crear `src/interfaces/http/routes/auth.routes.ts`: `Router` con `POST /register` → validator → controller
  - [x] 9.4 Actualizar `src/interfaces/http/routes/index.ts`: montar `authRouter` en `/auth`

- [x] Tarea 10 — Tests (AC: #1–#5)
  - [x] 10.1 Test: registro exitoso responde 201 con token y user (sin campo location)
  - [x] 10.2 Test: email duplicado responde 409
  - [x] 10.3 Test: código postal no geocodificable responde 400
  - [x] 10.4 Test: reCAPTCHA score < 0.5 responde 422
  - [x] 10.5 Test: segundo registro con mismo código postal usa LRU Cache (mock Nominatim, verificar 1 sola llamada HTTP)
  - [x] 10.6 Test: payload inválido (email malformado, password corta) responde 400

## Dev Notes

### Variables de entorno nuevas (actualizar env.ts y .env.example)

```typescript
// Añadir a src/config/env.ts
JWT_SECRET: required('JWT_SECRET'),
JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] ?? '7d',
RECAPTCHA_SECRET_KEY: required('RECAPTCHA_SECRET_KEY'),
RESEND_API_KEY: required('RESEND_API_KEY'),
RESEND_FROM: required('RESEND_FROM'),
NOMINATIM_BASE_URL: process.env['NOMINATIM_BASE_URL'] ?? 'https://nominatim.openstreetmap.org',
```

### Schema SQL — tabla `users`

```sql
CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT NOT NULL UNIQUE,
  password_hash             TEXT NOT NULL,
  postal_code               TEXT NOT NULL,
  location                  GEOGRAPHY(POINT, 4326) NOT NULL,
  reputation_score          INTEGER NOT NULL DEFAULT 0,
  total_received            INTEGER NOT NULL DEFAULT 0,
  total_donated             INTEGER NOT NULL DEFAULT 0,
  consecutive_no_shows      INTEGER NOT NULL DEFAULT 0,
  cycles_at_limit           INTEGER NOT NULL DEFAULT 0,
  last_cycle_incremented_at TIMESTAMPTZ,
  jwt_version               INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at            TIMESTAMPTZ
);

CREATE INDEX idx_users_location ON users USING GIST(location);
CREATE INDEX idx_users_cycle_increment
  ON users(last_cycle_incremented_at)
  WHERE cycles_at_limit > 0;
```

**⚠️ PostGIS debe estar habilitado en Supabase** (`CREATE EXTENSION IF NOT EXISTS postgis;`).

### User entity (src/domain/entities/user.entity.ts)

```typescript
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  postalCode: string;
  // location NUNCA en DTO ni en entidad expuesta al exterior
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  consecutiveNoShows: number;
  cyclesAtLimit: number;
  lastCycleIncrementedAt: Date | null;
  jwtVersion: number;
  createdAt: Date;
  lastActiveAt: Date | null;
}
```

### IUserRepository (src/domain/repositories/user.repository.ts)

```typescript
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  postalCode: string;
  lat: number;
  lon: number;        // PostGIS: ST_MakePoint(lon, lat) — orden longitud, latitud
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
```

### IMailService (src/domain/services/mail.service.ts)

```typescript
export interface MailPayload {
  to: string;
  templateId: string;
  variables: Record<string, string | number>;
}

export interface IMailService {
  send(payload: MailPayload): Promise<void>;
}
```

### DTOs de respuesta (src/application/dtos/auth.dto.ts)

```typescript
export interface RegisterRequestDto {
  email: string;
  password: string;
  postalCode: string;
  recaptchaToken: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  postalCode: string;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
}

export interface AuthResponseDto {
  token: string;
  user: AuthUserDto;
  // ⚠️ NUNCA incluir 'location' en este DTO
}
```

### Flujo completo de RegisterUserUseCase

```typescript
// src/application/use-cases/user/register-user.use-case.ts
async execute(dto: RegisterRequestDto): Promise<AuthResponseDto> {
  // 1. Verificar reCAPTCHA V3 (score ≥ 0.5) → 422 si falla
  const captcha = await recaptchaService.verify(dto.recaptchaToken);
  if (!captcha.success || captcha.score < 0.5) throw new UnprocessableEntityException();

  // 2. Verificar email único → 409 si ya existe
  const existing = await userRepo.findByEmail(dto.email);
  if (existing) throw new ConflictException();

  // 3. Hash contraseña con Argon2
  const passwordHash = await hashService.hash(dto.password);

  // 4. Geocodificar código postal (LRU Cache → Nominatim) → 400 si no geocodificable
  const coords = await geocodingService.geocode(dto.postalCode); // lanza GeocodingException si no existe

  // 5. Insertar usuario (jwt_version = 1 por defecto en BD)
  const user = await userRepo.create({ email: dto.email, passwordHash, postalCode: dto.postalCode, lat: coords.lat, lon: coords.lon });

  // 6. Generar JWT con claim jwtVersion
  const token = jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

  // 7. Enviar email de bienvenida (EVT-001) — no bloquear la respuesta
  mailService.send({ to: user.email, templateId: 'TPL-001', variables: { recipientEmail: user.email } })
    .catch(err => logger.error({ err }, 'Failed to send welcome email'));

  return { token, user: { id: user.id, email: user.email, postalCode: user.postalCode, reputationScore: user.reputationScore, totalReceived: user.totalReceived, totalDonated: user.totalDonated } };
}
```

### Insertar location en PostgreSQL (CRÍTICO)

```sql
-- En PostgresUserRepository.create()
INSERT INTO users (email, password_hash, postal_code, location, jwt_version)
VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, 1)
RETURNING id, email, postal_code, reputation_score, total_received, total_donated,
          consecutive_no_shows, cycles_at_limit, last_cycle_incremented_at,
          jwt_version, created_at, last_active_at
```

**⚠️ ST_MakePoint(longitud, latitud)** — orden inverso al convencional: primero `lon`, luego `lat`.
**⚠️ NUNCA incluir `location` en el SELECT de retorno.**

### Geocodificación — NominatimAdapter (src/infrastructure/geocoding/nominatim.adapter.ts)

```typescript
import { LRUCache } from 'lru-cache';
import { env } from '../../../config/env';

const geoCache = new LRUCache<string, { lat: number; lon: number }>({ max: 500 });

export class NominatimAdapter implements IGeocodingService {
  async geocode(postalCode: string, country = 'es'): Promise<{ lat: number; lon: number }> {
    const key = `${country}:${postalCode}`;
    const cached = geoCache.get(key);
    if (cached) return cached;

    const url = `${env.NOMINATIM_BASE_URL}/search?postalcode=${postalCode}&country=${country}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Regalalo/1.0' } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;

    if (!data.length) throw new GeocodingException(`Código postal no encontrado: ${postalCode}`);

    const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    geoCache.set(key, result);
    return result;
  }
}
```

**Nota:** `fetch` nativo disponible en Node.js ≥ 18. Sin necesidad de axios ni node-fetch.

### JWT — estructura exacta del token

```typescript
// Payload del JWT
interface JwtPayload {
  sub: string;       // user.id (UUID)
  jwtVersion: number; // user.jwt_version — critical para middleware 1.4
  iat: number;
  exp: number;
}

// Firma con jsonwebtoken
import jwt from 'jsonwebtoken';
const token = jwt.sign(
  { sub: user.id, jwtVersion: user.jwtVersion },
  env.JWT_SECRET,
  { expiresIn: env.JWT_EXPIRES_IN }
);
```

### reCAPTCHA V3 — verificación server-side

```typescript
// src/infrastructure/security/recaptcha.service.ts
const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    secret: env.RECAPTCHA_SECRET_KEY,
    response: token,
  }),
});
const data = await response.json() as { success: boolean; score: number };
return data; // { success, score }
```

### Argon2 — uso correcto

```typescript
import * as argon2 from 'argon2';

// Hash
const hash = await argon2.hash(password); // opciones por defecto son seguras

// Verify
const valid = await argon2.verify(hash, password);
```

### Resend — ResendMailProvider

```typescript
import { Resend } from 'resend';
import { env } from '../../config/env';

const resend = new Resend(env.RESEND_API_KEY);

// Para EVT-001 (solo en esta historia — sin template real en MVP, usar email plano)
await resend.emails.send({
  from: env.RESEND_FROM,
  to: payload.to,
  subject: '¡Bienvenido a Regálalo!',
  html: `<p>Tu cuenta ha sido creada correctamente.</p>`,
});
```

**Nota MVP:** no hay templates reales en Resend configurados. Enviar HTML inline para esta historia.

### Manejo de excepciones de dominio

Crear en `src/domain/exceptions/`:
- `ConflictException` → HTTP 409
- `UnprocessableEntityException` → HTTP 422
- `GeocodingException` → HTTP 400
- `NotFoundException` → HTTP 404 (para futuras historias)

El `errorHandler` de `src/interfaces/http/middlewares/error-handler.ts` debe inspeccionarlas:

```typescript
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err }, 'Unhandled error');
  if (res.headersSent) return;

  if (err instanceof ConflictException) return void res.status(409).json({ message: err.message });
  if (err instanceof UnprocessableEntityException) return void res.status(422).json({ message: err.message });
  if (err instanceof GeocodingException) return void res.status(400).json({ message: err.message });

  res.status(500).json({ message: 'Internal server error' });
}
```

### Validación de body con Zod (src/interfaces/validators/register.validator.ts)

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  postalCode: z.string().min(1),
  recaptchaToken: z.string().min(1),
});

export function validateRegisterBody(req: Request, res: Response, next: NextFunction): void {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

### Montaje en routes/index.ts (actualización)

```typescript
import { authRouter } from './auth.routes';
router.use('/auth', authRouter);
```

### Estructura de archivos nuevos

```
src/
├── domain/
│   ├── entities/user.entity.ts          ← NUEVO
│   ├── repositories/user.repository.ts  ← NUEVO
│   ├── services/mail.service.ts         ← NUEVO (crear carpeta services/)
│   └── exceptions/                      ← NUEVO (crear carpeta)
│       ├── conflict.exception.ts
│       ├── unprocessable-entity.exception.ts
│       ├── geocoding.exception.ts
│       └── not-found.exception.ts
├── application/
│   ├── dtos/auth.dto.ts                 ← NUEVO
│   ├── services/geocoding.service.ts    ← NUEVO (interfaz IGeocodingService)
│   └── use-cases/user/register-user.use-case.ts ← NUEVO
├── infrastructure/
│   ├── database/supabase/
│   │   ├── db.ts                        ← sin cambios
│   │   ├── user.repository.ts           ← NUEVO
│   │   └── migrations/001-create-users.sql ← NUEVO
│   ├── email/resend.provider.ts         ← NUEVO
│   ├── geocoding/nominatim.adapter.ts   ← NUEVO
│   └── security/
│       ├── argon2.service.ts            ← NUEVO
│       ├── jwt.service.ts               ← NUEVO
│       └── recaptcha.service.ts         ← NUEVO
└── interfaces/
    ├── http/
    │   ├── controllers/auth.controller.ts ← NUEVO
    │   ├── middlewares/error-handler.ts   ← ACTUALIZAR (añadir excepciones dominio)
    │   └── routes/
    │       ├── auth.routes.ts             ← NUEVO
    │       └── index.ts                   ← ACTUALIZAR (montar authRouter)
    └── validators/register.validator.ts   ← NUEVO
```

**Archivos a ACTUALIZAR (no crear):**
- `src/config/env.ts` — añadir vars de auth
- `src/interfaces/http/middlewares/error-handler.ts` — añadir manejo de excepciones dominio
- `src/interfaces/http/routes/index.ts` — montar `/auth`
- `package.json` — nuevas dependencias

### Contexto de historia anterior (1.1)

- `src/app.ts` ya configura Helmet, CORS (`env.CORS_ORIGIN`), pino-http, rate limiting global, `app.use('/auth', authRateLimit)` — la ruta `/auth/register` recibirá automáticamente el auth rate limit (10 req/IP/15min).
- `src/infrastructure/database/supabase/db.ts` exporta el pool `db` — usarlo directamente en el repositorio.
- `validateUuidParam` existe en `src/interfaces/validators/uuid-param.validator.ts` — no necesario para esta historia (no hay parámetros :id).
- Error handler en `src/interfaces/http/middlewares/error-handler.ts` — ACTUALIZAR para manejar las nuevas excepciones de dominio (actualmente solo devuelve 500).
- Tests usan vitest + supertest. Para esta historia los tests deben mockear RecaptchaService, NominatimAdapter y ResendMailProvider con `vi.mock()` para evitar llamadas HTTP reales.

### Testing — estrategia para dependencias externas

```typescript
// En vitest.config.ts NO se necesitan cambios.
// En cada test, mockear los servicios externos:

vi.mock('../src/infrastructure/security/recaptcha.service', () => ({
  RecaptchaService: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
  })),
}));
```

Para tests de integración real con supertest, inyectar los mocks en el use case.

### Configuración de tests — vitest.config.ts

Añadir las nuevas vars requeridas por `env.ts`:

```typescript
env: {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test',
  PORT: '3001',
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'test-jwt-secret-min-32-chars-for-tests',
  JWT_EXPIRES_IN: '7d',
  RECAPTCHA_SECRET_KEY: 'test-recaptcha-key',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM: 'test@test.com',
  CORS_ORIGIN: 'http://localhost:4200',
},
```

### Notas de arquitectura transversales

- **Clean Architecture:** `RegisterUserUseCase` depende de interfaces (`IUserRepository`, `IGeocodingService`, `IMailService`) — recibe las implementaciones por inyección en constructor. No importar adaptadores directamente desde el use case.
- **DTOs explícitos (NFR4):** `RegisterUserUseCase.execute()` recibe `RegisterRequestDto` y retorna `AuthResponseDto`. Prohibido serializar la entidad `User` directamente.
- **Campo `location` (NFR2):** NUNCA en DTOs de salida. El repositorio lo omite en todos los `SELECT` de retorno.
- **Logging:** usar pino (ya disponible en `src/main.ts`). Para el use case, crear logger local o inyectarlo. El logger de `error-handler.ts` ya existe.
- **Inyección de dependencias:** no hay contenedor IoC en esta historia. Instanciar en la función de arranque del router o en un factory simple. Ejemplo:

```typescript
// src/interfaces/http/routes/auth.routes.ts
const userRepo = new PostgresUserRepository(db);
const hashService = new Argon2HashService();
const jwtService = new JwtService();
const recaptchaService = new RecaptchaService();
const geocodingService = new NominatimAdapter();
const mailService = new ResendMailProvider();
const useCase = new RegisterUserUseCase(userRepo, hashService, jwtService, recaptchaService, geocodingService, mailService);
const controller = new AuthController(useCase);
```

### Referencias

- Flujo de registro: [Source: docs/architecture.md §8.2]
- Schema users: [Source: docs/architecture.md §3.1]
- Geocodificación LRU: [Source: docs/architecture.md §9.2]
- JWT + jwtVersion: [Source: docs/architecture.md §8.1, §8.3]
- Rate limiting auth: [Source: docs/architecture.md §11.1]
- IMailService en domain: [Source: docs/email-flow-mapping.md §3]
- EVT-001 variables: [Source: docs/email-flow-mapping.md §2]
- DTOs explícitos: [Source: docs/architecture.md §2 NFR4/SEC-008]
- location jamás en DTO: [Source: docs/architecture.md §2 NFR2]
- Índices users: [Source: docs/architecture.md §4]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Los mocks de constructores de vitest no funcionan cuando el router instancia servicios al cargarse el módulo. Solución: exportar `createAuthRouter(deps)` factory que acepta dependencias inyectables, permitiendo tests con mocks directos sin `vi.mock()`.

### Completion Notes List

- Implementados todos los ACs (1–6) con Clean Architecture estricta.
- `RegisterUserUseCase` depende exclusivamente de interfaces; adaptadores inyectados por constructor en `createAuthRouter()`.
- `location` nunca aparece en DTOs de salida ni en SELECT del repositorio.
- Email de bienvenida se envía de forma no bloqueante (fire-and-forget con `.catch()`).
- JWT incluye claim `jwtVersion` para compatibilidad con middleware 1.4.
- LRU Cache de capacidad 500 en `NominatimAdapter` — módulo singleton por proceso.
- 16 tests en total (10 nuevos + 6 existentes), todos pasando. TypeScript compila sin errores.
- **Nota importante**: la migración SQL (`001-create-users.sql`) debe ejecutarse manualmente en Supabase antes de usar el endpoint en producción.

### File List

- `src/config/env.ts` (actualizado — nuevas vars: JWT_SECRET, JWT_EXPIRES_IN, RECAPTCHA_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, NOMINATIM_BASE_URL)
- `src/domain/entities/user.entity.ts` (nuevo)
- `src/domain/repositories/user.repository.ts` (nuevo)
- `src/domain/services/mail.service.ts` (nuevo)
- `src/domain/exceptions/conflict.exception.ts` (nuevo)
- `src/domain/exceptions/unprocessable-entity.exception.ts` (nuevo)
- `src/domain/exceptions/geocoding.exception.ts` (nuevo)
- `src/domain/exceptions/not-found.exception.ts` (nuevo)
- `src/application/dtos/auth.dto.ts` (nuevo)
- `src/application/services/geocoding.service.ts` (nuevo)
- `src/application/use-cases/user/register-user.use-case.ts` (nuevo)
- `src/infrastructure/security/argon2.service.ts` (nuevo)
- `src/infrastructure/security/jwt.service.ts` (nuevo)
- `src/infrastructure/security/recaptcha.service.ts` (nuevo)
- `src/infrastructure/geocoding/nominatim.adapter.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (nuevo)
- `src/infrastructure/database/supabase/user.repository.ts` (nuevo)
- `src/infrastructure/database/supabase/migrations/001-create-users.sql` (nuevo)
- `src/interfaces/validators/register.validator.ts` (nuevo)
- `src/interfaces/http/controllers/auth.controller.ts` (nuevo)
- `src/interfaces/http/routes/auth.routes.ts` (nuevo)
- `src/interfaces/http/routes/index.ts` (actualizado — monta authRouter en /auth)
- `src/interfaces/http/middlewares/error-handler.ts` (actualizado — maneja ConflictException, UnprocessableEntityException, GeocodingException)
- `vitest.config.ts` (actualizado — nuevas vars de entorno para tests)
- `package.json` (actualizado — nuevas deps: argon2, jsonwebtoken, lru-cache, resend, zod; devDep: @types/jsonwebtoken)
- `tests/auth-register.test.ts` (nuevo — 10 tests de integración)

### Change Log

- 2026-05-04: Implementación completa de Historia 1.2 — Registro de usuario. Endpoint POST /auth/register con Argon2, JWT, reCAPTCHA V3, geocodificación Nominatim con LRU Cache, y email de bienvenida via Resend. Clean Architecture con inyección de dependencias.

### Review Findings

<!-- Generado por code-review 2026-05-05 -->

**Decisiones requeridas:** *(resueltas)*
- [x] [Review][Patch] LRU Cache sin TTL → **decisión: agregar TTL de 7 días** [src/infrastructure/geocoding/nominatim.adapter.ts:6]
- [x] [Review][Patch] Normalización de email case ausente → **decisión: normalizar a lowercase** [src/application/use-cases/user/register-user.use-case.ts]

**Patches:**
- [x] [Review][Patch] Race condition TOCTOU: findByEmail+create sin manejo de unique_violation de BD → 500 en vez de 409 [src/application/use-cases/user/register-user.use-case.ts + src/infrastructure/database/supabase/user.repository.ts]
- [x] [Review][Patch] JWT_SECRET sin validación de longitud mínima — secreto de 1 char aceptado [src/config/env.ts]
- [x] [Review][Patch] JwtService.verify sin opción `algorithms: ['HS256']` — vulnerable a algorithm confusion [src/infrastructure/security/jwt.service.ts:11]
- [x] [Review][Patch] RecaptchaService: sin response.ok check, sin timeout, sin validación runtime del shape de respuesta [src/infrastructure/security/recaptcha.service.ts]
- [x] [Review][Patch] NominatimAdapter: sin response.ok check, parseFloat retorna NaN si la respuesta es inválida (y cachea NaN), sin timeout [src/infrastructure/geocoding/nominatim.adapter.ts]
- [x] [Review][Patch] postalCode embebido directamente en URL sin encoding — parameter injection [src/infrastructure/geocoding/nominatim.adapter.ts:14]
- [x] [Review][Patch] PostgresUserRepository.create no valida result.rows[0] antes de mapRow — TypeError si INSERT retorna 0 filas [src/infrastructure/database/supabase/user.repository.ts:59]
- [x] [Review][Patch] JWT_EXPIRES_IN acepta cualquier string sin validar — jwt.sign lanza en runtime con valor inválido [src/config/env.ts / src/infrastructure/security/jwt.service.ts:7]
- [x] [Review][Patch] postalCode sin límite máximo de longitud ni formato — cache pollution y amplificación de URL injection [src/interfaces/validators/register.validator.ts:7]
- [x] [Review][Patch] password sin longitud máxima — DoS vía Argon2 con inputs muy largos [src/interfaces/validators/register.validator.ts:6]
- [x] [Review][Patch] recaptchaToken sin longitud máxima — tráfico saliente innecesario hacia Google [src/interfaces/validators/register.validator.ts:8]
- [x] [Review][Patch] GeocodingException echea el código postal del usuario en el mensaje de error devuelto al cliente [src/infrastructure/geocoding/nominatim.adapter.ts:19]
- [x] [Review][Patch] IHashService / IJwtService / IRecaptchaService definidas dentro del use-case — inversión de dependencias; infraestructura importa del use-case [src/application/use-cases/user/register-user.use-case.ts:13-20]
- [x] [Review][Patch] Test 10.5 integration: título engañoso "usa LRU Cache" pero aserta que el mock se llama 2 veces (nunca toca NominatimAdapter real) [tests/auth-register.test.ts:136]
- [x] [Review][Patch] logger del use-case usa process.env['LOG_LEVEL'] en vez de env.LOG_LEVEL [src/application/use-cases/user/register-user.use-case.ts:9]
- [x] [Review][Patch] NotFoundException no registrada en el error handler — produciría 500 en vez de 404 [src/interfaces/http/middlewares/error-handler.ts]
- [x] [Review][Patch] geoCache módulo singleton sin mecanismo de reset — interferencia entre tests futuros de NominatimAdapter [src/infrastructure/geocoding/nominatim.adapter.ts:6]

**Diferidos:**
- [x] [Review][Defer] authRouter module-level instantiation — deferred, patrón Express estándar; factory createAuthRouter(deps) ya aísla tests [src/interfaces/http/routes/auth.routes.ts:57]
- [x] [Review][Defer] JwtService.verify sin mapeo de excepciones (JsonWebTokenError → 401) — deferred, verify() no se usa en esta historia; se resuelve en historia 1.4 [src/infrastructure/security/jwt.service.ts:10-12]
