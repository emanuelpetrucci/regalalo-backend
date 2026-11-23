---
title: "Ver perfil privado del usuario autenticado"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 5.1: Ver perfil privado del usuario autenticado

Status: done

## Historia

Como usuario autenticado,
quiero poder consultar mi propio perfil completo,
para conocer mi reputación, estadísticas y datos de cuenta.

## Acceptance Criteria

1. **Dado** que envío `GET /users/me` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ id, email, postalCode, reputationScore, totalReceived, totalDonated, consecutiveNoShows, createdAt }` **Y** el campo `location` no aparece en la respuesta **Y** tampoco aparecen `passwordHash`, `jwtVersion`, `cyclesAtLimit`, `lastCycleIncrementedAt`, `lastActiveAt`.

2. **Dado** que el `reputationScore` del usuario es negativo, **cuando** el servidor procesa la petición, **entonces** el valor negativo se retorna sin truncar.

3. **Dado** que envío `GET /users/me` sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Crear DTO `GetPrivateProfileResponseDto` (AC: #1, #2)
  - [x] Crear `src/application/dtos/get-private-profile.dto.ts`
  - [x] Campos: `id`, `email`, `postalCode`, `reputationScore`, `totalReceived`, `totalDonated`, `consecutiveNoShows`, `createdAt`

- [x] Task 2: Crear `GetPrivateProfileUseCase` (AC: #1, #2)
  - [x] Crear `src/application/use-cases/user/get-private-profile.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`
  - [x] `execute(userId: string): Promise<GetPrivateProfileResponseDto>`
  - [x] Llama `userRepo.findById(userId)`, mapea a DTO (sin `location`, sin `passwordHash`, sin campos internos)

- [x] Task 3: Crear `UserController` (AC: #1, #2, #3)
  - [x] Crear `src/interfaces/http/controllers/user.controller.ts`
  - [x] Constructor: `(getPrivateProfileUseCase: GetPrivateProfileUseCase)`
  - [x] Método `getPrivateProfile(req, res, next)`: llama `execute(req.currentUser!.id)`, responde `200`

- [x] Task 4: Crear `users.routes.ts` con factory `createUserRouter(deps)` (AC: #1, #3)
  - [x] Crear `src/interfaces/http/routes/users.routes.ts`
  - [x] Mismo patrón que `delivery-sessions.routes.ts`: interfaz `UserRouterDeps`, `createUserRouter(deps = {})`, `export const userRouter = createUserRouter()`
  - [x] Deps: `userRepo`, `jwtService`
  - [x] Ruta: `GET /me` con `authMiddleware` → `controller.getPrivateProfile`
  - [x] **Sin** `validateUuidParam` — `/me` es literal, no es un UUID

- [x] Task 5: Registrar el router en `index.ts` (AC: #1)
  - [x] En `src/interfaces/http/routes/index.ts`: importar `userRouter` de `./users.routes`, añadir `router.use('/users', userRouter)`

- [x] Task 6: Escribir tests (AC: #1, #2, #3)
  - [x] Crear `tests/users-me.test.ts`
  - [x] Test 21.1: sin auth → 401
  - [x] Test 21.2: auth válida → 200, body contiene los 8 campos correctos
  - [x] Test 21.3: `location` no aparece en el body de respuesta
  - [x] Test 21.4: `reputationScore` negativo → retornado sin truncar

### Review Findings

- [x] [Review][Decision] Double `findById` / TOCTOU / NotFoundException 404 disclosure — Resuelto: opción 2 — `NotFoundException` reemplazado por `UnauthorizedException` en el use case. [src/application/use-cases/user/get-private-profile.use-case.ts:10]
- [x] [Review][Patch] `req.currentUser!` non-null assertion sin type guard — Resuelto: guard explícito `if (!req.currentUser)` + `next(new UnauthorizedException())`. [src/interfaces/http/controllers/user.controller.ts:11]
- [x] [Review][Patch] Test 21.2: `createdAt` verificado solo con `toHaveProperty` sin aserción de valor o formato — Resuelto: cambiado a `expect(res.body.createdAt).toBe('2026-01-01T00:00:00.000Z')`. [tests/users-me.test.ts:72]
- [x] [Review][Patch] Sin test para rama `NotFoundException` cuando `findById` retorna null — Resuelto: añadido test 21.5 que verifica 401 cuando `findById` retorna null en el use case. [tests/users-me.test.ts]
- [x] [Review][Defer] Singleton `userRouter = createUserRouter()` instancia infraestructura real al importar [src/interfaces/http/routes/users.routes.ts:35] — deferred, pre-existing (mismo patrón que `authRouter`, `itemRouter`, `deliverySessionRouter`)
- [x] [Review][Defer] `buildTestApp` shallow merge puede perder mocks en futuras extensiones del helper [tests/users-me.test.ts:45] — deferred, pre-existing (mismo patrón en tests de otras historias)
- [x] [Review][Defer] `GET /users/me` sin rate limiting específico — pollear `consecutiveNoShows` permite inferir eventos del sistema; mitigado por rate limiting global del app [src/interfaces/http/routes/users.routes.ts] — deferred, pre-existing
- [x] [Review][Defer] `UserController` acoplado a clase concreta `GetPrivateProfileUseCase` en lugar de interfaz — violación de DIP, dificulta unit test del controller en aislamiento [src/interfaces/http/controllers/user.controller.ts:3] — deferred, pre-existing (patrón del proyecto)
- [x] [Review][Defer] Route importa infraestructura concreta (`db`, `JwtService`, `PostgresUserRepository`) en la capa de interfaces [src/interfaces/http/routes/users.routes.ts:2-4] — deferred, pre-existing
- [x] [Review][Defer] `PostgresUserRepository.findById` selecciona columnas sensibles (`password_hash`, `jwt_version`, `cycles_at_limit`, etc.) en SQL — el DTO las filtra correctamente, pero viajan desde DB hasta la capa de aplicación [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] Test 21.4 no cubre `reputationScore = NaN` o `Infinity` proveniente de DB corrupta — JSON.stringify los serializa como `null` silenciosamente [tests/users-me.test.ts:77] — deferred, pre-existing edge case

---

## Notas para el Dev Agent

### Este es el primer endpoint de la Épica 5

No existe ningún archivo de users en rutas, controllers ni use cases. Todos son NUEVOS. Las historias 5.2–5.6 extenderán gradualmente `UserController`, `users.routes.ts` y `IUserRepository`.

### Estado actual de `IUserRepository`

```typescript
// src/domain/repositories/user.repository.ts — estado actual (sin cambios en esta historia)
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
```

**No añadir nuevos métodos al repositorio en esta historia.** `findById` retorna el `User` completo que ya tiene todos los campos necesarios para el DTO.

### Patrón exacto del factory router a seguir

`delivery-sessions.routes.ts` es el modelo de referencia exacto. La estructura del nuevo `users.routes.ts`:

```typescript
import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { UserController } from '../controllers/user.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';

export interface UserRouterDeps {
  userRepo?: IUserRepository;
  jwtService?: IJwtService;
}

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getPrivateProfileUseCase = new GetPrivateProfileUseCase(userRepo);
  const controller = new UserController(getPrivateProfileUseCase);

  const router = Router();

  router.get(
    '/me',
    authMiddleware,
    (req, res, next) => controller.getPrivateProfile(req, res, next),
  );

  return router;
}

export const userRouter = createUserRouter();
```

### Código completo de los archivos nuevos

**`src/application/dtos/get-private-profile.dto.ts`:**
```typescript
export interface GetPrivateProfileResponseDto {
  id: string;
  email: string;
  postalCode: string;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  consecutiveNoShows: number;
  createdAt: Date;
}
```

**`src/application/use-cases/user/get-private-profile.use-case.ts`:**
```typescript
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { GetPrivateProfileResponseDto } from '../../dtos/get-private-profile.dto';

export class GetPrivateProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetPrivateProfileResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return {
      id: user.id,
      email: user.email,
      postalCode: user.postalCode,
      reputationScore: user.reputationScore,
      totalReceived: user.totalReceived,
      totalDonated: user.totalDonated,
      consecutiveNoShows: user.consecutiveNoShows,
      createdAt: user.createdAt,
    };
  }
}
```

**`src/interfaces/http/controllers/user.controller.ts`:**
```typescript
import { Request, Response, NextFunction } from 'express';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
  ) {}

  async getPrivateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getPrivateProfileUseCase.execute(req.currentUser!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

### Actualización de `src/interfaces/http/routes/index.ts`

Estado actual:
```typescript
import { deliverySessionRouter } from './delivery-sessions.routes';
// ...
router.use('/delivery-sessions', deliverySessionRouter);
```

Añadir (después de la importación de `deliverySessionRouter` y del `router.use('/delivery-sessions', deliverySessionRouter)`):
```typescript
import { userRouter } from './users.routes';
// ...
router.use('/users', userRouter);
```

### El campo `userRepo` se comparte entre auth middleware y use case

En el test, el mock de `userRepo.findById` es llamado DOS veces:
1. Por el `authMiddleware` para validar el JWT y cargar el usuario
2. Por `GetPrivateProfileUseCase.execute()` para construir el DTO

Ambas llamadas usan el mismo mock y retornan el mismo `mockUser`. El test debe configurar el mock para responder correctamente en ambas llamadas. Con `vi.fn().mockResolvedValue(mockUser)` es suficiente (responde igual siempre).

### Estructura del test

```typescript
// tests/users-me.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 3,
  totalDonated: 1,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastActiveAt: null,
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createUserRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('21.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('21.2 — auth válida → 200 con los 8 campos del perfil privado', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: USER_UUID,
      email: 'user@example.com',
      postalCode: '28001',
      reputationScore: 42,
      totalReceived: 3,
      totalDonated: 1,
      consecutiveNoShows: 0,
    });
    expect(res.body).toHaveProperty('createdAt');
  });

  it('21.3 — la respuesta no expone campos internos ni location', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('location');
    expect(res.body).not.toHaveProperty('jwtVersion');
    expect(res.body).not.toHaveProperty('cyclesAtLimit');
    expect(res.body).not.toHaveProperty('lastCycleIncrementedAt');
    expect(res.body).not.toHaveProperty('lastActiveAt');
  });

  it('21.4 — reputationScore negativo → retornado sin truncar', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({ ...mockUser, reputationScore: -60 }),
        create: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.reputationScore).toBe(-60);
  });
});
```

### Reglas de arquitectura a respetar

- **NFR2**: `location` NUNCA en el DTO. La consulta en `findById` hace `SELECT` sin `location` — verificar que sigue siendo así.
- **NFR4**: DTO explícito en `application/dtos/` — ya cubierto con `GetPrivateProfileResponseDto`.
- **NFR3**: La ruta `/me` es un literal, NO es un `:id` UUID. No aplicar `validateUuidParam` aquí.

### Preparación para historias futuras (no implementar ahora)

Las historias 5.2–5.6 extenderán estos archivos:
- `UserController`: se añadirán métodos (getReputationHistory, getUserSessions, etc.)
- `users.routes.ts`: se añadirán rutas (`GET /me/reputation-history`, `GET /me/delivery-sessions`, etc.)
- `IUserRepository`: se añadirán métodos para obtener historial, sesiones, objetos, solicitudes
- `UserRouterDeps`: se añadirán dependencias según se necesiten repos adicionales

**No anticipar nada** de lo anterior en esta historia.

### Regresiones a verificar

Esta historia no modifica ningún comportamiento existente. Los únicos archivos modificados son `index.ts` (registro de ruta nueva). Todos los tests existentes deben seguir pasando.

Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Completion Notes

Implementación completada el 2026-05-13. Se crearon 5 archivos nuevos y se modificó `index.ts`:

- `GetPrivateProfileResponseDto`: DTO explícito con los 8 campos permitidos, sin `location`, `passwordHash` ni campos internos.
- `GetPrivateProfileUseCase`: llama `findById`, lanza `NotFoundException` si el usuario no existe, mapea al DTO.
- `UserController`: controlador simple, delega al use case, responde 200.
- `users.routes.ts`: factory pattern con `UserRouterDeps`, ruta `GET /me` con authMiddleware. Sin `validateUuidParam` (literal, no UUID).
- `index.ts`: registrado `/users → userRouter`.
- 4 tests (21.1–21.4): cobertura de 401 sin auth, 200 con 8 campos, exclusión de campos internos, reputationScore negativo.

Suite completa: 23 archivos, 165 tests, 0 regresiones.

## File List

- `src/application/dtos/get-private-profile.dto.ts` (nuevo)
- `src/application/use-cases/user/get-private-profile.use-case.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (nuevo)
- `src/interfaces/http/routes/users.routes.ts` (nuevo)
- `src/interfaces/http/routes/index.ts` (modificado)
- `tests/users-me.test.ts` (nuevo)

## Change Log

- 2026-05-13: Implementación completa de historia 5.1 — ver perfil privado del usuario autenticado. `GET /users/me` retorna 8 campos del perfil sin exponer datos internos. 4 nuevos tests (21.1–21.4), 5 archivos nuevos, 1 modificado.
