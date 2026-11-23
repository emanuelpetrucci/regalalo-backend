---
title: "Middleware de autenticación con validación de jwt_version"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 1.4: Middleware de autenticación con validación de jwt_version

Status: done

## Historia

Como sistema,
quiero verificar el JWT en cada petición autenticada y validar que `jwtVersion` coincide con la base de datos,
para que los tokens invalidados por reset de contraseña no den acceso a recursos protegidos.

## Criterios de Aceptación

**Dado** que envío una petición a una ruta protegida con un JWT válido y `jwtVersion` coincidente con `users.jwt_version`
**Cuando** el middleware procesa el token
**Entonces** la petición pasa al controlador con el usuario inyectado como `req.currentUser`

**Dado** que envío una petición a una ruta protegida sin header `Authorization`
**Cuando** el middleware procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío una petición con un JWT con firma inválida o expirado
**Cuando** el middleware procesa el token
**Entonces** responde `401 Unauthorized`

**Dado** que envío una petición con un JWT válido cuyo `jwtVersion` difiere del valor en `users.jwt_version`
**Cuando** el middleware procesa el token
**Entonces** responde `401 Unauthorized`

## Tareas / Subtareas

- [x] Tarea 1 — Añadir `findById` a la interfaz y la implementación del repositorio (AC: #1, #4)
  - [x] 1.1 Actualizar `src/domain/repositories/user.repository.ts`: añadir `findById(id: string): Promise<User | null>` a `IUserRepository`
  - [x] 1.2 Actualizar `src/infrastructure/database/supabase/user.repository.ts`: implementar `findById` reutilizando `mapRow` existente (misma query que `findByEmail` cambiando `WHERE email = $1` por `WHERE id = $1`)

- [x] Tarea 2 — Declaración de tipo para `req.currentUser` (AC: #1)
  - [x] 2.1 Crear `src/@types/express/index.d.ts`: augmentar `express-serve-static-core` Request con `currentUser?: User`

- [x] Tarea 3 — Crear `createAuthMiddleware` factory (AC: #1–#4)
  - [x] 3.1 Crear `src/interfaces/http/middlewares/auth.middleware.ts`: factory `createAuthMiddleware(jwtService, userRepo)` que retorna middleware Express async (ver Dev Notes §Flujo completo)

- [x] Tarea 4 — Exportar instancia de producción del middleware (AC: #1)
  - [x] 4.1 Actualizar `src/interfaces/http/routes/index.ts`: crear e importar `authMiddleware` con dependencias reales (`new JwtService()`, `new PostgresUserRepository(db)`) y exportarlo para uso en epics futuros

- [x] Tarea 5 — Tests (AC: #1–#4)
  - [x] 5.1 Crear `tests/auth-middleware.test.ts` con al menos 7 tests (ver Dev Notes §Testing)

### Review Findings

- [x] [Review][Patch] Strip de `passwordHash` antes de asignar `req.currentUser` — decisión: (A) strip en el middleware. Eliminar `passwordHash` del objeto user antes de `req.currentUser = user` en `auth.middleware.ts`.
- [x] [Review][Patch] Test 5.8 no verifica los campos completos del objeto User en `req.currentUser` — el route handler de test solo expone `{ userId }`, por lo que la aserción no confirma que todos los campos del User están presentes [tests/auth-middleware.test.ts]
- [x] [Review][Patch] Sin test para la rama `typeof`: falta un test donde `jwtService.verify()` retorna payload con `sub` o `jwtVersion` inválidos (null, undefined, tipo incorrecto) [tests/auth-middleware.test.ts]
- [x] [Review][Defer] Helper `buildTestApp` reemplaza el objeto completo de dependencias en override — pasar solo una propiedad de `userRepo` descarta las demás (fragile para futuros tests) [tests/auth-middleware.test.ts:27] — deferred, pre-existing
- [x] [Review][Defer] Posible type mismatch en campos `Date` del driver pg (`lastCycleIncrementedAt`, `lastActiveAt`) — pre-existente en `findByEmail` y todo el repositorio — deferred, pre-existing
- [x] [Review][Defer] `findById` duplica la anotación de tipo inline de `findByEmail` en lugar de extraer un tipo compartido — patrón pre-existente en el repositorio [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing

## Dev Notes

### Análisis de archivos existentes a ACTUALIZAR

**`src/domain/repositories/user.repository.ts` — estado actual:**
```typescript
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
```
- Añadir `findById(id: string): Promise<User | null>` como tercer método
- NO modificar los métodos existentes — `findByEmail` y `create` ya son usados por `RegisterUserUseCase` y `LoginUserUseCase`

**`src/infrastructure/database/supabase/user.repository.ts` — estado actual:**
- `PostgresUserRepository` ya tiene `mapRow` privado con el tipo completo de la fila
- `findById` debe ejecutar la misma query SELECT que `findByEmail` pero con `WHERE id = $1` en lugar de `WHERE email = $1`
- El tipo del resultado y el `mapRow` son idénticos — reutilizar sin duplicar

```typescript
async findById(id: string): Promise<User | null> {
  const result = await this.db.query<{ /* mismo tipo que findByEmail */ }>(
    `SELECT id, email, password_hash, postal_code, reputation_score, total_received,
            total_donated, consecutive_no_shows, cycles_at_limit,
            last_cycle_incremented_at, jwt_version, created_at, last_active_at
     FROM users WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return this.mapRow(result.rows[0]);
}
```

**`src/interfaces/http/routes/index.ts` — estado actual:**
```typescript
import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';

const router = Router();
router.use(healthRouter);
router.use('/auth', authRouter);
export { router };
```
- Añadir imports: `db` desde infra, `JwtService`, `PostgresUserRepository`, `createAuthMiddleware`
- Crear e exportar `authMiddleware` al nivel del módulo (igual que `authRouter = createAuthRouter()`)
- El `router` exportado NO cambia — el middleware no se aplica globalmente aquí; las rutas protegidas futuras (épicas 2–5) importarán `authMiddleware` y lo usarán por ruta

**`tests/auth-login.test.ts` — patrón de mocks para `userRepo`:**
Los mocks de `userRepo` en los tests existentes solo tienen `findByEmail` y `create`. Al añadir `findById` a la interfaz, los tests existentes NO se rompen porque TypeScript no valida exhaustividad en objetos de mock de vitest.

### Declaración de tipo para `req.currentUser`

```typescript
// src/@types/express/index.d.ts
import { User } from '../../domain/entities/user.entity';

declare module 'express-serve-static-core' {
  interface Request {
    currentUser?: User;
  }
}
```

- **⚠️ Usar `express-serve-static-core`**, NO `express` ni `declare global { namespace Express }` — es el módulo interno que Express usa para definir `Request`
- El archivo `.d.ts` bajo `src/` queda incluido por `tsconfig.json` (que incluye `src/**/*`)
- El import de `User` convierte el archivo en módulo TypeScript, lo que activa el `declare module` de augmentación
- El campo es `currentUser?: User` (opcional) para que TypeScript no fuerze aserciones en código fuera del middleware

### Flujo completo del middleware

```typescript
// src/interfaces/http/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

export function createAuthMiddleware(
  jwtService: IJwtService,
  userRepo: IUserRepository,
) {
  return async function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // 1. Extraer token del header Authorization
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException();
      }
      const token = authHeader.slice(7);

      // 2. Verificar firma y expiración del JWT (lanza si inválido/expirado)
      let payload: Record<string, unknown>;
      try {
        payload = jwtService.verify(token);
      } catch {
        throw new UnauthorizedException();
      }

      // 3. Extraer y validar claims del payload
      const userId = payload['sub'];
      const jwtVersion = payload['jwtVersion'];
      if (typeof userId !== 'string' || typeof jwtVersion !== 'number') {
        throw new UnauthorizedException();
      }

      // 4. Buscar usuario en BD — responder 401 si no existe
      const user = await userRepo.findById(userId);
      if (!user) {
        throw new UnauthorizedException();
      }

      // 5. Comparar jwtVersion del token con el de la BD
      if (user.jwtVersion !== jwtVersion) {
        throw new UnauthorizedException();
      }

      // 6. Inyectar usuario en la request para uso downstream
      req.currentUser = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

**⚠️ CRÍTICO — `jwtService.verify` lanza, no retorna null:**
`JwtService.verify` llama a `jwt.verify(...)` que lanza `JsonWebTokenError` o `TokenExpiredError` ante cualquier problema. NUNCA retorna null. El bloque `try/catch` interno alrededor de `jwtService.verify` es obligatorio para convertir esos errores en `UnauthorizedException`.

**⚠️ CRÍTICO — No diferenciar errores 401:**
Todos los casos de fallo (sin header, token inválido, usuario no encontrado, jwtVersion mismatch) deben retornar exactamente el mismo 401. No agregar mensajes que distingan los casos.

**⚠️ CRÍTICO — `payload['jwtVersion']` puede ser undefined:**
El claim `jwtVersion` puede no estar presente en tokens externos o maliciosos. La validación `typeof jwtVersion !== 'number'` cubre `undefined`, `null` y otros tipos no numéricos.

### Instancia de producción en `routes/index.ts`

```typescript
// src/interfaces/http/routes/index.ts (estado final)
import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { createAuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
router.use(healthRouter);
router.use('/auth', authRouter);

export { router };

export const authMiddleware = createAuthMiddleware(
  new JwtService(),
  new PostgresUserRepository(db),
);
```

- `authMiddleware` se exporta desde `routes/index.ts` para que las rutas de épicas futuras puedan importarlo
- Las rutas protegidas lo usarán como: `router.get('/items', authMiddleware, controller.list)`
- En esta historia NO se aplica a ninguna ruta existente — su uso real comienza en épica 2

### Estructura de archivos

```
src/
├── @types/
│   └── express/
│       └── index.d.ts               ← NUEVO (type augmentation)
├── domain/
│   └── repositories/
│       └── user.repository.ts       ← ACTUALIZAR (añadir findById)
├── infrastructure/
│   └── database/supabase/
│       └── user.repository.ts       ← ACTUALIZAR (implementar findById)
└── interfaces/
    └── http/
        ├── middlewares/
        │   └── auth.middleware.ts    ← NUEVO
        └── routes/
            └── index.ts             ← ACTUALIZAR (exportar authMiddleware)

tests/
└── auth-middleware.test.ts          ← NUEVO
```

**Archivos a NO tocar:**
- `src/application/services/jwt.service.ts` — `IJwtService.verify` ya es correcto
- `src/infrastructure/security/jwt.service.ts` — `JwtService.verify` ya usa `algorithms: ['HS256']`
- `src/domain/exceptions/unauthorized.exception.ts` — ya existe y está registrado en el error handler
- `src/interfaces/http/middlewares/error-handler.ts` — ya maneja `UnauthorizedException` → 401
- `src/app.ts` — sin cambios; el middleware se aplica en rutas individuales, no globalmente
- Todos los tests existentes — `findById` nuevo en interfaz no rompe mocks de vitest

### Testing — estrategia

```typescript
// tests/auth-middleware.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthMiddleware } from '../src/interfaces/http/middlewares/auth.middleware';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 3,
  totalDonated: 5,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 2,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

function buildTestApp(depOverrides: Record<string, unknown> = {}) {
  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: mockUser.jwtVersion }),
    },
    userRepo: {
      findById: vi.fn().mockResolvedValue(mockUser),
      findByEmail: vi.fn(),
      create: vi.fn(),
    },
  };
  const deps = { ...defaultDeps, ...depOverrides };

  const middleware = createAuthMiddleware(
    deps.jwtService as Parameters<typeof createAuthMiddleware>[0],
    deps.userRepo as Parameters<typeof createAuthMiddleware>[1],
  );

  const app = express();
  app.use(express.json());
  app.get('/protected', middleware, (req, res) => {
    res.json({ userId: req.currentUser?.id });
  });
  app.use(errorHandler);
  return { app, deps };
}
```

**Tests a implementar (≥ 7):**
- `5.1` — token válido + jwtVersion coincidente → 200, `req.currentUser.id` = mockUser.id
- `5.2` — sin header `Authorization` → 401
- `5.3` — header `Authorization` con formato incorrecto (`Token xxx` sin "Bearer ") → 401
- `5.4` — `jwtService.verify` lanza (firma inválida) → 401
- `5.5` — `jwtService.verify` lanza `TokenExpiredError` (token expirado) → 401
- `5.6` — token válido pero `userRepo.findById` retorna null → 401
- `5.7` — token válido, usuario existe, `jwtVersion` del token (ej: `1`) difiere del usuario en BD (ej: `2`) → 401
- `5.8` — token válido, `jwtVersion` coincidente, verificar que `req.currentUser` contiene el objeto User completo

**Test para jwtVersion mismatch:**
```typescript
it('jwtVersion mismatch retorna 401', async () => {
  const { app } = buildTestApp({
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 1 }), // versión antigua
    },
    // userRepo.findById retorna mockUser con jwtVersion: 2
  });
  const res = await request(app)
    .get('/protected')
    .set('Authorization', 'Bearer some.valid.token');
  expect(res.status).toBe(401);
});
```

### Inteligencia de historia anterior (1.3) aplicable a 1.4

- **Patrones de importación de interfaces:** `IJwtService` desde `application/services/jwt.service`, `IUserRepository` desde `domain/repositories/user.repository` — mismas rutas que en `LoginUserUseCase`
- **`env.LOG_LEVEL` no `process.env['LOG_LEVEL']`:** Si se añade logging al middleware, usar `import { env } from '../../../config/env'`
- **No agregar logger en este middleware:** El error handler ya loguea los errores. El middleware de auth es hot path — logear cada 401 podría ser ruidoso. Omitir logger en el middleware (o solo loguear en nivel `debug` si se necesita)
- **Mock pattern en tests:** Usar mismo patrón `buildTestApp(depOverrides)` que `auth-login.test.ts` — override específico de deps, no reescribir el objeto entero
- **Review findings de 1.3 ya aplicados:** `algorithms: ['HS256']` ya está en `JwtService.verify` — no tocar

### Contexto de rutas globales a preservar

- `app.use(globalRateLimit)` en `src/app.ts` aplica automáticamente a rutas protegidas
- `app.use(express.json())` ya activo globalmente
- `app.use(helmet())` ya activo con HSTS, CSP deshabilitado, etc.
- El middleware de auth NO interfiere con ninguno de estos — se aplicará a nivel de ruta, DESPUÉS de los middlewares globales

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

Sin bloqueos. Implementación directa siguiendo las Dev Notes al pie de la letra.

### Completion Notes List

- Tarea 1: `findById` añadido a `IUserRepository` y a `PostgresUserRepository` reutilizando `mapRow` existente. Sin impacto en tests existentes (vitest no valida exhaustividad de mocks).
- Tarea 2: Type augmentation en `src/@types/express/index.d.ts` usando `express-serve-static-core` con `currentUser?: User` opcional.
- Tarea 3: Factory `createAuthMiddleware` implementada con flujo completo: extracción de Bearer token → verificación JWT con catch interno → validación de claims `sub`/`jwtVersion` → lookup en BD → comparación de versión → inyección en `req.currentUser`.
- Tarea 4: `authMiddleware` exportado desde `routes/index.ts` con dependencias reales para uso en épicas futuras. El `router` no cambia.
- Tarea 5: 8 tests cubren todos los ACs: 200 happy path, 401 sin header, 401 formato incorrecto, 401 firma inválida, 401 token expirado, 401 usuario no encontrado, 401 jwtVersion mismatch, y verificación de objeto User completo en `req.currentUser`.
- Suite completa: 36/36 tests pasando, sin regresiones.

### File List

- `src/domain/repositories/user.repository.ts` — MODIFICADO (añadido `findById` a `IUserRepository`)
- `src/infrastructure/database/supabase/user.repository.ts` — MODIFICADO (implementado `findById`)
- `src/@types/express/index.d.ts` — NUEVO (type augmentation de `req.currentUser`)
- `src/interfaces/http/middlewares/auth.middleware.ts` — NUEVO (`createAuthMiddleware` factory)
- `src/interfaces/http/routes/index.ts` — MODIFICADO (exporta `authMiddleware` instancia de producción)
- `tests/auth-middleware.test.ts` — NUEVO (8 tests)

## Change Log

- 2026-05-05: Historia 1.4 implementada — middleware de autenticación JWT con validación de `jwt_version`, type augmentation de Express Request, y suite de 8 tests (36 total sin regresiones).
