---
title: "Login de usuario"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 1.3: Login de usuario

Status: done

## Historia

Como usuario registrado,
quiero poder iniciar sesión con mi email y contraseña,
para obtener un token JWT y acceder a las funciones autenticadas.

## Criterios de Aceptación

**Dado** que envío `POST /auth/login` con credenciales válidas y token reCAPTCHA con score ≥ 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ token: JWT, user: { id, email, reputationScore } }`
**Y** el JWT incluye el claim `jwtVersion` con el valor actual de `users.jwt_version`

**Dado** que envío `POST /auth/login` con contraseña incorrecta
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío `POST /auth/login` con email no registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized` (igual que contraseña incorrecta, sin revelar si el email existe)

**Dado** que envío `POST /auth/login` con token reCAPTCHA de score < 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `422 Unprocessable Entity`

## Tareas / Subtareas

- [x] Tarea 1 — Crear `UnauthorizedException` y registrarla en el error handler (AC: #2, #3)
  - [x] 1.1 Crear `src/domain/exceptions/unauthorized.exception.ts`: clase `UnauthorizedException extends Error`, mensaje por defecto `'Unauthorized'`
  - [x] 1.2 Actualizar `src/interfaces/http/middlewares/error-handler.ts`: añadir `if (err instanceof UnauthorizedException) → res.status(401).json({ message: err.message })`

- [x] Tarea 2 — DTOs de login (AC: #1)
  - [x] 2.1 Actualizar `src/application/dtos/auth.dto.ts`: añadir `LoginRequestDto` (email, password, recaptchaToken), `LoginUserDto` (id, email, reputationScore), `LoginResponseDto` (token, user: LoginUserDto)

- [x] Tarea 3 — `LoginUserUseCase` (AC: #1–#4)
  - [x] 3.1 Crear `src/application/use-cases/user/login-user.use-case.ts`: inyectar `IUserRepository`, `IHashService`, `IJwtService`, `IRecaptchaService` en constructor. Implementar flujo completo (ver Dev Notes §Flujo)

- [x] Tarea 4 — Validador de login (AC: #1–#3)
  - [x] 4.1 Crear `src/interfaces/validators/login.validator.ts`: schema Zod para `LoginRequestDto`; email válido, password min 8 max 1024, recaptchaToken min 1 max 2048

- [x] Tarea 5 — Actualizar controlador y rutas (AC: #1)
  - [x] 5.1 Actualizar `src/interfaces/http/controllers/auth.controller.ts`: añadir `loginUseCase: LoginUserUseCase` al constructor; añadir método `login(req, res, next)`
  - [x] 5.2 Actualizar `src/interfaces/http/routes/auth.routes.ts`: crear `LoginUserUseCase` en factory con las mismas deps ya disponibles (userRepo, hashService, jwtService, recaptchaService); inyectar en controller; añadir `router.post('/login', validateLoginBody, ...)`

- [x] Tarea 6 — Tests (AC: #1–#4)
  - [x] 6.1 Crear `tests/auth-login.test.ts` con al menos 6 tests (ver Dev Notes §Testing)

## Dev Notes

### Análisis de archivos existentes a ACTUALIZAR

**`src/interfaces/http/controllers/auth.controller.ts` — estado actual:**
```typescript
export class AuthController {
  constructor(private readonly registerUseCase: RegisterUserUseCase) {}
  async register(req, res, next): Promise<void> { ... }
}
```
- Añadir `private readonly loginUseCase: LoginUserUseCase` al constructor (segundo parámetro)
- Añadir método `login(req, res, next)` siguiendo el mismo patrón: try/await/catch(next)
- Responde `200` (no 201)

**`src/interfaces/http/routes/auth.routes.ts` — estado actual:**
```typescript
export interface AuthRouterDeps {
  userRepo?: IUserRepository;
  hashService?: IHashService;
  jwtService?: IJwtService;
  recaptchaService?: IRecaptchaService;
  geocodingService?: IGeocodingService;
  mailService?: IMailService;
}
export function createAuthRouter(deps: AuthRouterDeps = {}): Router {
  // instancia RegisterUserUseCase + AuthController(registerUseCase)
  // router.post('/register', validateRegisterBody, ...)
}
export const authRouter = createAuthRouter();
```
- `AuthRouterDeps` NO cambia — `LoginUserUseCase` solo usa las deps ya presentes
- Dentro del factory: crear `LoginUserUseCase(userRepo, hashService, jwtService, recaptchaService)`
- Cambiar `new AuthController(registerUseCase)` → `new AuthController(registerUseCase, loginUseCase)`
- Añadir `router.post('/login', validateLoginBody, (req, res, next) => controller.login(req, res, next))`

**`src/interfaces/http/middlewares/error-handler.ts` — estado actual:**
- Maneja: `ConflictException` → 409, `UnprocessableEntityException` → 422, `GeocodingException` → 400, `NotFoundException` → 404
- Añadir `UnauthorizedException` → 401 (antes del catch-all 500)

**`src/application/dtos/auth.dto.ts` — estado actual:**
```typescript
export interface RegisterRequestDto { email, password, postalCode, recaptchaToken }
export interface AuthUserDto { id, email, postalCode, reputationScore, totalReceived, totalDonated }
export interface AuthResponseDto { token, user: AuthUserDto }
```
- Añadir interfaces nuevas; NO modificar las existentes (registro sigue usando `AuthResponseDto`)

### Flujo completo de `LoginUserUseCase`

```typescript
// src/application/use-cases/user/login-user.use-case.ts
async execute(dto: LoginRequestDto): Promise<LoginResponseDto> {
  // 1. Verificar reCAPTCHA V3 (score ≥ 0.5) → 422 si falla
  const captcha = await this.recaptchaService.verify(dto.recaptchaToken);
  if (!captcha.success || captcha.score < 0.5) throw new UnprocessableEntityException();

  // 2. Normalizar email a lowercase
  const normalizedEmail = dto.email.toLowerCase();

  // 3. Buscar usuario — responder 401 si no existe (NO revelar que el email no existe)
  const user = await this.userRepo.findByEmail(normalizedEmail);
  if (!user) throw new UnauthorizedException();

  // 4. Verificar contraseña con Argon2 → 401 si inválida
  const valid = await this.hashService.verify(user.passwordHash, dto.password);
  if (!valid) throw new UnauthorizedException();

  // 5. Generar JWT con jwtVersion del usuario actual en BD
  const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

  // 6. Retornar DTO de login (más reducido que el de registro)
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      reputationScore: user.reputationScore,
    },
  };
}
```

**⚠️ CRÍTICO — Prevención de enumeración de usuarios:**
El response HTTP 401 debe ser **idéntico** para "email no registrado" y "contraseña incorrecta". Ambos deben usar `throw new UnauthorizedException()`. NUNCA lanzar un mensaje que diferencie los dos casos (`'Email no encontrado'` está prohibido).

**⚠️ CRÍTICO — `jwtVersion` en el JWT:**
El claim `jwtVersion` en el token debe venir del campo `user.jwtVersion` leído en BD en este request, no de ningún valor hardcodeado. El middleware 1.4 comparará este claim con `users.jwt_version` en BD para detectar tokens invalidados por reset de contraseña.

**⚠️ NO geocodificar en login:**
El login NO necesita `IGeocodingService` ni `IMailService`. Estas dependencias ya están disponibles en el factory, pero `LoginUserUseCase` solo recibe: `IUserRepository`, `IHashService`, `IJwtService`, `IRecaptchaService`.

### `UnauthorizedException` (nueva)

```typescript
// src/domain/exceptions/unauthorized.exception.ts
export class UnauthorizedException extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedException';
  }
}
```

Misma estructura que `ConflictException`, `GeocodingException`, etc.

### DTOs de login — estructura exacta

```typescript
// Añadir a src/application/dtos/auth.dto.ts (sin modificar los existentes)

export interface LoginRequestDto {
  email: string;
  password: string;
  recaptchaToken: string;
}

export interface LoginUserDto {
  id: string;
  email: string;
  reputationScore: number;
}

export interface LoginResponseDto {
  token: string;
  user: LoginUserDto;
}
```

**Nota:** `LoginUserDto` es más reducido que `AuthUserDto` — el login solo devuelve `id, email, reputationScore`. Esto es intencional según los ACs de la épica.

### Validador Zod para login

```typescript
// src/interfaces/validators/login.validator.ts
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(1024),   // max 1024 previene DoS en Argon2
  recaptchaToken: z.string().min(1).max(2048),
});

export function validateLoginBody(req: Request, res: Response, next: NextFunction): void {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

Misma forma que `validateRegisterBody` en `src/interfaces/validators/register.validator.ts`.

### Actualización completa del controlador

```typescript
// src/interfaces/http/controllers/auth.controller.ts (estado final)
import { Request, Response, NextFunction } from 'express';
import { RegisterUserUseCase } from '../../../application/use-cases/user/register-user.use-case';
import { LoginUserUseCase } from '../../../application/use-cases/user/login-user.use-case';
import { RegisterRequestDto } from '../../../application/dtos/auth.dto';
import { LoginRequestDto } from '../../../application/dtos/auth.dto';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUserUseCase,
  ) {}

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as RegisterRequestDto;
      const result = await this.registerUseCase.execute(dto);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as LoginRequestDto;
      const result = await this.loginUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

### Factory de rutas — cambios en `createAuthRouter`

Dentro de la función factory, tras crear `registerUseCase`, añadir:
```typescript
const loginUseCase = new LoginUserUseCase(
  userRepo,
  hashService,
  jwtService,
  recaptchaService,
);

const controller = new AuthController(registerUseCase, loginUseCase);
// ...
router.post('/login', validateLoginBody, (req, res, next) =>
  controller.login(req, res, next),
);
```

El `authRouter = createAuthRouter()` al final del archivo sigue funcionando sin cambios.

### Estructura de archivos

```
src/
├── domain/
│   └── exceptions/
│       └── unauthorized.exception.ts   ← NUEVO
├── application/
│   ├── dtos/auth.dto.ts                ← ACTUALIZAR (añadir Login*Dto)
│   └── use-cases/user/
│       └── login-user.use-case.ts      ← NUEVO
└── interfaces/
    ├── http/
    │   ├── controllers/auth.controller.ts  ← ACTUALIZAR (añadir login)
    │   ├── middlewares/error-handler.ts    ← ACTUALIZAR (añadir UnauthorizedException)
    │   └── routes/auth.routes.ts           ← ACTUALIZAR (LoginUserUseCase + /login route)
    └── validators/login.validator.ts       ← NUEVO

tests/
└── auth-login.test.ts   ← NUEVO
```

**Archivos a NO tocar:**
- `src/domain/repositories/user.repository.ts` — `findByEmail` ya existe y retorna `passwordHash` en la entidad `User`
- `src/infrastructure/security/argon2.service.ts` — `verify(hash, password)` ya implementado
- `src/infrastructure/security/jwt.service.ts` — `sign()` ya implementado
- `src/config/env.ts` — sin nuevas vars de entorno
- `vitest.config.ts` — sin cambios (vars ya configuradas)

### Testing — estrategia

```typescript
// tests/auth-login.test.ts
// Mismo patrón que auth-register.test.ts usando buildTestApp(depOverrides)

function buildTestApp(depOverrides = {}) {
  const app = express();
  app.use(express.json());
  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn().mockResolvedValue(mockUser),  // ← usuario EXISTENTE por defecto
      create: vi.fn(),
    },
    hashService: {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),           // ← contraseña VÁLIDA por defecto
    },
    jwtService: {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    },
    recaptchaService: {
      verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
    },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn() },
  };
  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/auth', createAuthRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}
```

**Tests a implementar:**
- `6.1` — login exitoso responde 200 con token y user `{ id, email, reputationScore }` (sin postalCode, sin location)
- `6.2` — contraseña incorrecta responde 401 (hashService.verify retorna false)
- `6.3` — email no registrado responde 401 (userRepo.findByEmail retorna null)
- `6.4` — reCAPTCHA score < 0.5 responde 422
- `6.5` — reCAPTCHA success=false responde 422
- `6.6` — payload inválido (email malformado) responde 400
- `6.7` — payload inválido (password corta < 8 chars) responde 400
- `6.8` — verificar que el JWT generado contiene el jwtVersion del usuario (jwtService.sign recibió el payload correcto)

**Test crítico — respuesta 401 idéntica (enumeración):**
```typescript
it('email no registrado responde 401 igual que contraseña incorrecta', async () => {
  const { app: appNoUser } = buildTestApp({
    userRepo: { findByEmail: vi.fn().mockResolvedValue(null), create: vi.fn() },
  });
  const { app: appWrongPwd } = buildTestApp({
    hashService: { hash: vi.fn(), verify: vi.fn().mockResolvedValue(false) },
  });

  const res1 = await request(appNoUser).post('/auth/login').send(validLoginBody);
  const res2 = await request(appWrongPwd).post('/auth/login').send(validLoginBody);

  expect(res1.status).toBe(401);
  expect(res2.status).toBe(401);
  expect(res1.body.message).toBe(res2.body.message); // mismo mensaje
});
```

### Inteligencia de historia anterior (1.2) aplicable a 1.3

Del historial de review findings de 1.2 ya resueltos y patrones establecidos:

- **Email a lowercase:** `dto.email.toLowerCase()` antes de `findByEmail` — ya hecho en register, replicar en login
- **Interfaces en capas correctas:** `IHashService` en `domain/services/`, `IJwtService` e `IRecaptchaService` en `application/services/` — ya corregido, `LoginUserUseCase` debe importar desde esas mismas rutas
- **`env.LOG_LEVEL` no `process.env['LOG_LEVEL']`:** el logger del use case debe usar `import { env } from '../../../config/env'` y `pino({ level: env.LOG_LEVEL })`
- **Límite de longitud en validadores:** password max 1024 (DoS Argon2), recaptchaToken max 2048
- **`algorithms: ['HS256']` en JwtService.verify:** ya implementado en 1.2, deferred para 1.4, no tocar

Del commit `28e8daa` (más reciente): "update dependencies, enhance JWT handling, and improve error handling in Express routes" — confirma que las mejoras de seguridad del JWT están aplicadas.

### Contexto de rutas globales a preservar

De `src/app.ts` (ya configurado en historia 1.1):
- `app.use('/auth', authRateLimit)` → la ruta `/auth/login` recibirá automáticamente el rate limiting auth (10 req/IP/15min)
- `app.use(express.json())` → parser de body ya activo globalmente
- `app.use(helmet())` → cabeceras de seguridad activas

No se requiere ningún cambio en `src/app.ts`.

### Inyección de dependencias en `LoginUserUseCase`

```typescript
// src/application/use-cases/user/login-user.use-case.ts
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IHashService } from '../../../domain/services/hash.service';
import { IJwtService } from '../../services/jwt.service';
import { IRecaptchaService } from '../../services/recaptcha.service';
import { LoginRequestDto, LoginResponseDto } from '../../dtos/auth.dto';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { UnprocessableEntityException } from '../../../domain/exceptions/unprocessable-entity.exception';
import pino from 'pino';
import { env } from '../../../config/env';

const logger = pino({ level: env.LOG_LEVEL });

export class LoginUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hashService: IHashService,
    private readonly jwtService: IJwtService,
    private readonly recaptchaService: IRecaptchaService,
  ) {}

  async execute(dto: LoginRequestDto): Promise<LoginResponseDto> { ... }
}
```

**Nota:** El logger se declara a nivel de módulo (igual que en `register-user.use-case.ts`).

### Rutas finales de `/auth`

| Método | Ruta | Middleware | Handler |
|--------|------|-----------|---------|
| POST | `/auth/register` | validateRegisterBody | AuthController.register |
| POST | `/auth/login` | validateLoginBody | AuthController.login |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Sin issues durante la implementación. Todos los tests pasaron en el primer intento.

### Completion Notes List

- Implementados todos los ACs (1–4) con Clean Architecture estricta.
- `LoginUserUseCase` depende exclusivamente de interfaces (`IUserRepository`, `IHashService`, `IJwtService`, `IRecaptchaService`).
- `AuthRouterDeps` no cambió — `LoginUserUseCase` reutiliza las mismas 4 dependencias ya disponibles en el factory.
- Respuesta 401 idéntica para email inexistente y contraseña incorrecta (test 6.3b verifica que `res.body.message` sea igual en ambos casos).
- Email normalizado a lowercase antes de `findByEmail` (test 6.9 verifica el comportamiento).
- JWT incluye `jwtVersion` del usuario leído en BD en tiempo de request (test 6.8 verifica el payload de `jwtService.sign`).
- `UnauthorizedException` sigue el mismo patrón que las excepciones existentes (`ConflictException`, etc.).
- 10 tests nuevos en `tests/auth-login.test.ts`; suite completa: 26 tests, 0 fallos, 0 regresiones.
- Sin nuevas variables de entorno ni dependencias externas.

### File List

- `src/domain/exceptions/unauthorized.exception.ts` (nuevo)
- `src/application/dtos/auth.dto.ts` (actualizado — añadir LoginRequestDto, LoginUserDto, LoginResponseDto)
- `src/application/use-cases/user/login-user.use-case.ts` (nuevo)
- `src/interfaces/validators/login.validator.ts` (nuevo)
- `src/interfaces/http/controllers/auth.controller.ts` (actualizado — añadir loginUseCase + método login)
- `src/interfaces/http/routes/auth.routes.ts` (actualizado — añadir LoginUserUseCase + ruta POST /login)
- `src/interfaces/http/middlewares/error-handler.ts` (actualizado — añadir UnauthorizedException → 401)
- `tests/auth-login.test.ts` (nuevo — ≥ 7 tests)

### Review Findings

- [x] [Review][Patch] Timing oracle — login retorna sin llamar a hashService.verify cuando el email no existe, creando diferencia de timing que permite enumeración de usuarios; el test 6.3b solo compara mensajes, no latencia [src/application/use-cases/user/login-user.use-case.ts:28-31]
- [x] [Review][Patch] captcha.score ausente/null no está guardado — `undefined < 0.5` evalúa a `false` en JS, bots sin campo `score` pasan la verificación [src/application/use-cases/user/login-user.use-case.ts:23]
- [x] [Review][Patch] user.passwordHash null o vacío no está guardado — cuentas sin contraseña (ej. OAuth-only) podrían causar 500 o pass silencioso en hashService.verify [src/application/use-cases/user/login-user.use-case.ts:33]
- [x] [Review][Patch] Email PII expuesto en log estructurado — `logger.warn({ email: normalizedEmail }, ...)` viola el Dev Note de seguridad; el email no debe aparecer en texto plano en los logs [src/application/use-cases/user/login-user.use-case.ts:29]
- [x] [Review][Defer] UnauthorizedException sin Object.setPrototypeOf — pre-existente en todas las excepciones del proyecto, no introducido en esta historia — deferred, pre-existing
- [x] [Review][Defer] Errores de red en reCAPTCHA service no manejados específicamente → 500 genérico — no hay AC que lo requiera — deferred, pre-existing
- [x] [Review][Defer] Logger instanciado por módulo en vez de singleton compartido — patrón pre-existente establecido en 1.2 — deferred, pre-existing
- [x] [Review][Defer] Sin test para fallo de reCAPTCHA service (network error) — nice-to-have, no requerido por AC — deferred, pre-existing
- [x] [Review][Defer] Sin test para fallo de jwtService.sign — nice-to-have, no requerido por AC — deferred, pre-existing

### Change Log

- 2026-05-05: Implementación completa de Historia 1.3 — Login de usuario. Endpoint POST /auth/login con reCAPTCHA V3, verificación de contraseña Argon2, JWT con claim jwtVersion. Clean Architecture con inyección de dependencias. 10 tests de integración.
