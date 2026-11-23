---
title: "Recuperación y reset de contraseña"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 1.5: Recuperación y reset de contraseña

Status: done

## Historia

Como usuario,
quiero poder recuperar el acceso a mi cuenta si olvidé mi contraseña,
para no perder permanentemente el acceso.

## Criterios de Aceptación

**Dado** que envío `POST /auth/forgot-password` con un email registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK` con mensaje genérico
**Y** se crea un registro en `password_reset_tokens` con `expires_at = NOW() + 1h` y `used = FALSE`
**Y** se envía email con enlace de recuperación (EVT-002 / TPL-002) al usuario

**Dado** que envío `POST /auth/forgot-password` con un email no registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK` con el mismo mensaje genérico sin revelar si el email existe
**Y** no se envía ningún email ni se crea ningún token

**Dado** que envío `POST /auth/reset-password` con token válido, no expirado, no utilizado y nueva contraseña
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK`
**Y** en una transacción atómica: `password_hash` actualizado con Argon2, `jwt_version` incrementado en 1, token marcado como `used = TRUE`
**Y** se envía email de confirmación de reset exitoso (EVT-013 / TPL-008)

**Dado** que envío `POST /auth/reset-password` con token expirado o ya utilizado
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que existe un JWT activo para el usuario y se completa un reset de contraseña
**Cuando** se intenta usar el JWT antiguo en una ruta protegida
**Entonces** el middleware responde `401 Unauthorized` porque `jwtVersion` ya no coincide

## Tareas / Subtareas

- [x] Tarea 1 — BadRequestException + registro en error handler (AC: #4)
  - [x] 1.1 Crear `src/domain/exceptions/bad-request.exception.ts`
  - [x] 1.2 Actualizar `src/interfaces/http/middlewares/error-handler.ts`: añadir handler para `BadRequestException` → 400

- [x] Tarea 2 — Migración SQL para `password_reset_tokens` (AC: #1, #3)
  - [x] 2.1 Crear `src/infrastructure/database/supabase/migrations/002-create-password-reset-tokens.sql` (ver Dev Notes §Migración)
  - [x] 2.2 Aplicar la migración en Supabase (manual — fuera del código)

- [x] Tarea 3 — Entidad e interfaz de repositorio de tokens (AC: #1, #3, #4)
  - [x] 3.1 Crear `src/domain/entities/password-reset-token.entity.ts`
  - [x] 3.2 Crear `src/domain/repositories/password-reset-token.repository.ts`: interfaz `IPasswordResetTokenRepository` con `create`, `findByTokenHash`, `markUsedAndResetUserPassword`

- [x] Tarea 4 — Implementación del repositorio de tokens (AC: #1, #3, #4)
  - [x] 4.1 Crear `src/infrastructure/database/supabase/password-reset-token.repository.ts`: `PostgresPasswordResetTokenRepository` implementando la interfaz (ver Dev Notes §Implementación repositorio y §Transacción atómica)

- [x] Tarea 5 — DTOs (AC: #1, #3)
  - [x] 5.1 Crear `src/application/dtos/password-reset.dto.ts`: `ForgotPasswordRequestDto`, `ForgotPasswordResponseDto`, `ResetPasswordRequestDto`, `ResetPasswordResponseDto`

- [x] Tarea 6 — ForgotPasswordUseCase (AC: #1, #2)
  - [x] 6.1 Crear `src/application/use-cases/user/forgot-password.use-case.ts` (ver Dev Notes §Flujo ForgotPassword)

- [x] Tarea 7 — ResetPasswordUseCase (AC: #3, #4, #5)
  - [x] 7.1 Crear `src/application/use-cases/user/reset-password.use-case.ts` (ver Dev Notes §Flujo ResetPassword)

- [x] Tarea 8 — Validadores de request (AC: #1, #3)
  - [x] 8.1 Crear `src/interfaces/validators/forgot-password.validator.ts`: valida `email`
  - [x] 8.2 Crear `src/interfaces/validators/reset-password.validator.ts`: valida `token` y `newPassword` (8–128 chars)

- [x] Tarea 9 — Actualizar AuthController y auth.routes.ts (AC: #1, #3)
  - [x] 9.1 Actualizar `src/interfaces/http/controllers/auth.controller.ts`: añadir `forgotPassword` y `resetPassword` métodos (patrón idéntico a `register`/`login`)
  - [x] 9.2 Actualizar `src/interfaces/http/routes/auth.routes.ts`: añadir `passwordResetTokenRepo` a `AuthRouterDeps`, instanciar los dos nuevos use cases, registrar `POST /forgot-password` y `POST /reset-password` con sus validadores

- [x] Tarea 10 — Actualizar ResendMailProvider para TPL-002 y TPL-008 (AC: #1, #3)
  - [x] 10.1 Actualizar `src/infrastructure/email/resend.provider.ts`: añadir soporte para TPL-002 (enlace de reset) y TPL-008 (confirmación de reset) usando el `templateId` del payload (ver Dev Notes §ResendMailProvider)

- [x] Tarea 11 — Tests (AC: #1–#5)
  - [x] 11.1 Crear `tests/auth-password-reset.test.ts` con al menos 12 tests (ver Dev Notes §Testing)

## Dev Notes

### ⚠️ CRÍTICOS: decisiones de arquitectura

**Transacción atómica entre dos tablas:** El reset de contraseña requiere actualizar `users` (password_hash + jwt_version) y `password_reset_tokens` (used = TRUE) en una sola transacción. La solución adoptada es un método `markUsedAndResetUserPassword(tokenId, userId, newPasswordHash)` en `IPasswordResetTokenRepository` cuya implementación gestiona explícitamente `BEGIN/COMMIT/ROLLBACK` via `db.connect()`. Esto mantiene la transaccionalidad en la capa de infraestructura sin exponer `Pool` al use case.

**Anti-enumeración en forgot-password:** `ForgotPasswordUseCase` SIEMPRE retorna el mismo mensaje genérico 200, independientemente de si el email existe. El bloque de creación de token y envío de email se ejecuta solo si el usuario existe, pero nada en la respuesta lo revela.

**Token crudo vs. hash almacenado:** El token crudo (`rawToken`) se genera con `crypto.randomBytes(32).toString('hex')` (64 chars hex). El token almacenado en DB es `crypto.createHash('sha256').update(rawToken).digest('hex')`. El usuario recibe el token crudo en el enlace del email; el DB nunca almacena el crudo.

**Enlace de reset:** Se construye como `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`. `env.CORS_ORIGIN` ya contiene la URL base del frontend (por defecto `http://localhost:4200`).

---

### Migración SQL — `password_reset_tokens`

Archivo: `src/infrastructure/database/supabase/migrations/002-create-password-reset-tokens.sql`

```sql
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);
```

Aplicar en Supabase SQL editor antes de iniciar los tests de integración.

---

### Entidad y repositorio de tokens

**`src/domain/entities/password-reset-token.entity.ts`:**
```typescript
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}
```

**`src/domain/repositories/password-reset-token.repository.ts`:**
```typescript
import { PasswordResetToken } from '../entities/password-reset-token.entity';

export interface CreateTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IPasswordResetTokenRepository {
  create(input: CreateTokenInput): Promise<PasswordResetToken>;
  findByTokenHash(hash: string): Promise<PasswordResetToken | null>;
  markUsedAndResetUserPassword(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
  ): Promise<void>;
}
```

---

### Implementación repositorio y transacción atómica

**`src/infrastructure/database/supabase/password-reset-token.repository.ts`:**
```typescript
import { Pool } from 'pg';
import { PasswordResetToken } from '../../../domain/entities/password-reset-token.entity';
import {
  IPasswordResetTokenRepository,
  CreateTokenInput,
} from '../../../domain/repositories/password-reset-token.repository';

export class PostgresPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateTokenInput): Promise<PasswordResetToken> {
    const result = await this.db.query<{
      id: string; user_id: string; token_hash: string;
      expires_at: Date; used: boolean; created_at: Date;
    }>(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, token_hash, expires_at, used, created_at`,
      [input.userId, input.tokenHash, input.expiresAt],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByTokenHash(hash: string): Promise<PasswordResetToken | null> {
    const result = await this.db.query<{
      id: string; user_id: string; token_hash: string;
      expires_at: Date; used: boolean; created_at: Date;
    }>(
      `SELECT id, user_id, token_hash, expires_at, used, created_at
       FROM password_reset_tokens WHERE token_hash = $1`,
      [hash],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async markUsedAndResetUserPassword(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $1, jwt_version = jwt_version + 1 WHERE id = $2',
        [newPasswordHash, userId],
      );
      await client.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
        [tokenId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private mapRow(row: {
    id: string; user_id: string; token_hash: string;
    expires_at: Date; used: boolean; created_at: Date;
  }): PasswordResetToken {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      used: row.used,
      createdAt: row.created_at,
    };
  }
}
```

---

### Flujo ForgotPassword

**`src/application/use-cases/user/forgot-password.use-case.ts`:**
```typescript
import { randomBytes, createHash } from 'crypto';
import pino from 'pino';
import { env } from '../../../config/env';
import { ForgotPasswordRequestDto, ForgotPasswordResponseDto } from '../../dtos/password-reset.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { IMailService } from '../../../domain/services/mail.service';

const logger = pino({ level: env.LOG_LEVEL });

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(dto: ForgotPasswordRequestDto): Promise<ForgotPasswordResponseDto> {
    const normalizedEmail = dto.email.toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await this.tokenRepo.create({ userId: user.id, tokenHash, expiresAt });

      const resetLink = `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`;
      this.mailService
        .send({ to: user.email, templateId: 'TPL-002', variables: { resetLink } })
        .catch((err) => logger.error({ err }, 'Failed to send password reset email'));
    }

    return { message: 'Si el email existe, recibirás un enlace de recuperación.' };
  }
}
```

**Puntos críticos:**
- El `if (user)` es el único camino de acción. El path "no encontrado" no hace nada — misma respuesta.
- `randomBytes(32).toString('hex')` → string de 64 caracteres hex (256 bits de entropía).
- El token se hashea con SHA-256 antes de almacenar. En DB nunca aparece el token crudo.
- El `expiresAt` usa `Date.now()` para ser mockeables en tests (no `new Date()`).

---

### Flujo ResetPassword

**`src/application/use-cases/user/reset-password.use-case.ts`:**
```typescript
import { createHash } from 'crypto';
import pino from 'pino';
import { env } from '../../../config/env';
import { ResetPasswordRequestDto, ResetPasswordResponseDto } from '../../dtos/password-reset.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { IHashService } from '../../../domain/services/hash.service';
import { IMailService } from '../../../domain/services/mail.service';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

const logger = pino({ level: env.LOG_LEVEL });

export class ResetPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly hashService: IHashService,
    private readonly mailService: IMailService,
  ) {}

  async execute(dto: ResetPasswordRequestDto): Promise<ResetPasswordResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const tokenRecord = await this.tokenRepo.findByTokenHash(tokenHash);
    if (!tokenRecord || tokenRecord.used || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException();
    }

    const user = await this.userRepo.findById(tokenRecord.userId);
    if (!user) throw new BadRequestException();

    const newPasswordHash = await this.hashService.hash(dto.newPassword);

    await this.tokenRepo.markUsedAndResetUserPassword(
      tokenRecord.id,
      tokenRecord.userId,
      newPasswordHash,
    );

    this.mailService
      .send({ to: user.email, templateId: 'TPL-008', variables: {} })
      .catch((err) => logger.error({ err }, 'Failed to send password reset confirmation email'));

    return { message: 'Contraseña restablecida correctamente.' };
  }
}
```

**Puntos críticos:**
- La validación del token lanza `BadRequestException` en los tres casos de fallo (no encontrado, ya usado, expirado) — misma respuesta, sin distinguir.
- `tokenRecord.expiresAt < new Date()` — comparación directa de fechas JavaScript.
- `markUsedAndResetUserPassword` ejecuta la transacción atómica (detalles en §Implementación repositorio).
- El email de confirmación es fire-and-forget (`.catch()`), no bloquea la respuesta.

---

### BadRequestException

**`src/domain/exceptions/bad-request.exception.ts`:**
```typescript
export class BadRequestException extends Error {
  constructor(message = 'Bad Request') {
    super(message);
    this.name = 'BadRequestException';
  }
}
```

**Actualizar `src/interfaces/http/middlewares/error-handler.ts`:**
Añadir al inicio del bloque de excepciones (antes de `ConflictException`):
```typescript
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';
// ...
if (err instanceof BadRequestException) {
  res.status(400).json({ message: err.message });
  return;
}
```

---

### DTOs

**`src/application/dtos/password-reset.dto.ts`:**
```typescript
export interface ForgotPasswordRequestDto {
  email: string;
}

export interface ForgotPasswordResponseDto {
  message: string;
}

export interface ResetPasswordRequestDto {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponseDto {
  message: string;
}
```

---

### Validadores

**`src/interfaces/validators/forgot-password.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const schema = z.object({
  email: z.string().email(),
});

export function validateForgotPasswordBody(req: Request, res: Response, next: NextFunction): void {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

**`src/interfaces/validators/reset-password.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const schema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export function validateResetPasswordBody(req: Request, res: Response, next: NextFunction): void {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

---

### AuthController actualizado

Añadir imports de los nuevos use cases y DTOs. El constructor pasa de 2 a 4 parámetros:

```typescript
import { ForgotPasswordUseCase } from '../../../application/use-cases/user/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../../application/use-cases/user/reset-password.use-case';
import { ForgotPasswordRequestDto, ResetPasswordRequestDto } from '../../../application/dtos/password-reset.dto';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUserUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  // ... métodos register y login sin cambios ...

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as ForgotPasswordRequestDto;
      const result = await this.forgotPasswordUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as ResetPasswordRequestDto;
      const result = await this.resetPasswordUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

---

### auth.routes.ts actualizado

Partes que cambian en `createAuthRouter`:

```typescript
// Nuevos imports al inicio del archivo
import { PostgresPasswordResetTokenRepository } from '../../../infrastructure/database/supabase/password-reset-token.repository';
import { ForgotPasswordUseCase } from '../../../application/use-cases/user/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../../application/use-cases/user/reset-password.use-case';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { validateForgotPasswordBody } from '../../validators/forgot-password.validator';
import { validateResetPasswordBody } from '../../validators/reset-password.validator';

// AuthRouterDeps ampliado
export interface AuthRouterDeps {
  userRepo?: IUserRepository;
  hashService?: IHashService;
  jwtService?: IJwtService;
  recaptchaService?: IRecaptchaService;
  geocodingService?: IGeocodingService;
  mailService?: IMailService;
  passwordResetTokenRepo?: IPasswordResetTokenRepository; // NUEVO
}

// Dentro de createAuthRouter:
const passwordResetTokenRepo =
  deps.passwordResetTokenRepo ?? new PostgresPasswordResetTokenRepository(db);

const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepo, passwordResetTokenRepo, mailService);
const resetPasswordUseCase = new ResetPasswordUseCase(userRepo, passwordResetTokenRepo, hashService, mailService);

const controller = new AuthController(registerUseCase, loginUseCase, forgotPasswordUseCase, resetPasswordUseCase);

// Nuevas rutas (al final del router, antes del return):
router.post('/forgot-password', validateForgotPasswordBody, (req, res, next) =>
  controller.forgotPassword(req, res, next),
);
router.post('/reset-password', validateResetPasswordBody, (req, res, next) =>
  controller.resetPassword(req, res, next),
);
```

---

### ResendMailProvider

Actualizar `src/infrastructure/email/resend.provider.ts` para usar `templateId` y `variables`:

```typescript
import { Resend } from 'resend';
import { env } from '../../config/env';
import { IMailService, MailPayload } from '../../domain/services/mail.service';

const resend = new Resend(env.RESEND_API_KEY);

type TemplateRenderer = (vars: Record<string, string | number>) => { subject: string; html: string };

const templates: Record<string, TemplateRenderer> = {
  'TPL-001': (_v) => ({
    subject: '¡Bienvenido a Regálalo!',
    html: '<p>Tu cuenta ha sido creada correctamente.</p>',
  }),
  'TPL-002': (v) => ({
    subject: 'Recuperación de contraseña — Regálalo',
    html: `<p>Haz clic en el enlace para restablecer tu contraseña (válido 1 hora):</p><p><a href="${v['resetLink']}">${v['resetLink']}</a></p><p>Si no solicitaste este cambio, ignora este email.</p>`,
  }),
  'TPL-008': (_v) => ({
    subject: 'Contraseña restablecida — Regálalo',
    html: '<p>Tu contraseña ha sido restablecida correctamente. Si no fuiste tú, contacta con el soporte inmediatamente.</p>',
  }),
};

export class ResendMailProvider implements IMailService {
  async send(payload: MailPayload): Promise<void> {
    const renderer = templates[payload.templateId];
    const { subject, html } = renderer
      ? renderer(payload.variables)
      : { subject: 'Regálalo', html: '<p>Mensaje del sistema.</p>' };

    await resend.emails.send({
      from: env.RESEND_FROM,
      to: payload.to,
      subject,
      html,
    });
  }
}
```

---

### Testing — estrategia

**Patrón de tests:** Igual que `auth-middleware.test.ts` y `auth-login.test.ts`. Usar `buildTestApp` con deps inyectables.

**`tests/auth-password-reset.test.ts` — mínimo 12 tests:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

// Mock de repositorio de tokens
const mockTokenRepo = {
  create: vi.fn(),
  findByTokenHash: vi.fn(),
  markUsedAndResetUserPassword: vi.fn(),
};

// Mock de userRepo — incluir findById y findByEmail para ambos use cases
const mockUserRepo = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
};

// ... demás mocks (hashService, jwtService, recaptchaService, geocodingService, mailService)

function buildTestApp(overrides = {}) {
  const deps = {
    userRepo: mockUserRepo,
    passwordResetTokenRepo: mockTokenRepo,
    hashService: { hash: vi.fn().mockResolvedValue('$argon2id$new'), verify: vi.fn() },
    jwtService: { sign: vi.fn(), verify: vi.fn() },
    recaptchaService: { verify: vi.fn() },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
  const router = createAuthRouter(deps);
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  app.use(errorHandler);
  return { app, deps };
}
```

**Tests a implementar:**

`ForgotPasswordUseCase` (via ruta POST /auth/forgot-password):
- `f.1` — email registrado → 200, `tokenRepo.create` llamado, `mailService.send` llamado con TPL-002
- `f.2` — email no registrado → 200 con mismo mensaje, `tokenRepo.create` NO llamado, `mailService.send` NO llamado (anti-enumeración)
- `f.3` — email malformado (sin @) → 400 (validator Zod)
- `f.4` — body vacío → 400 (validator Zod)

`ResetPasswordUseCase` (via ruta POST /auth/reset-password):
- `r.1` — token válido, no usado, no expirado + nueva contraseña → 200, `markUsedAndResetUserPassword` llamado, `mailService.send` llamado con TPL-008
- `r.2` — token no encontrado (`findByTokenHash` retorna null) → 400
- `r.3` — token ya usado (`used: true`) → 400
- `r.4` — token expirado (`expiresAt` en el pasado) → 400
- `r.5` — usuario eliminado después de crear el token (`findById` retorna null) → 400
- `r.6` — body sin `token` → 400 (validator Zod)
- `r.7` — `newPassword` con menos de 8 caracteres → 400 (validator Zod)
- `r.8` — reset exitoso: `jwt_version` incrementado implícitamente por `markUsedAndResetUserPassword` (verificar que fue llamado con los parámetros correctos)

**⚠️ Para f.1 y f.2:** El `findByEmail` mock controla si el usuario existe. Para f.1, retorna `mockUser`; para f.2, retorna `null`. Verificar que el mensaje de respuesta es IDÉNTICO en ambos casos (anti-enumeración).

**⚠️ Para r.4 (token expirado):** Configurar el mock de `findByTokenHash` para retornar un token con `expiresAt` en el pasado:
```typescript
findByTokenHash: vi.fn().mockResolvedValue({
  id: 'token-uuid',
  userId: 'user-uuid',
  tokenHash: 'hashed',
  expiresAt: new Date(Date.now() - 1000), // 1 segundo en el pasado
  used: false,
  createdAt: new Date(),
}),
```

---

### Archivos a NO tocar

- `src/application/services/jwt.service.ts` — sin cambios
- `src/infrastructure/security/jwt.service.ts` — sin cambios
- `src/infrastructure/security/argon2.service.ts` — sin cambios
- `src/app.ts` — sin cambios (el rate limiting `/auth` ya cubre las nuevas rutas)
- `src/domain/repositories/user.repository.ts` — sin cambios (no necesita método nuevo)
- `src/infrastructure/database/supabase/user.repository.ts` — sin cambios (la transacción vive en el token repo)
- Tests existentes — no se rompen, no hay cambios en interfaces que usen

---

### Inteligencia de historias anteriores aplicable

- **Patrón de rutas con deps inyectables:** `createAuthRouter(deps: AuthRouterDeps = {})` — mismo patrón. Extender `AuthRouterDeps` con `passwordResetTokenRepo?: IPasswordResetTokenRepository`.
- **Patrón de use case:** Constructor con deps, `async execute(dto)`, lanza excepciones de dominio. Logger con `pino({ level: env.LOG_LEVEL })` — mismo patrón que `register-user` y `login-user`.
- **Fire-and-forget para emails:** `.catch((err) => logger.error({err}, '...'))` — mismo patrón que `RegisterUserUseCase`.
- **`email.toLowerCase()`:** normalizar email antes de `findByEmail`. Ya aplicado en 1.2 y 1.3.
- **`authRateLimit` en `app.ts`:** `app.use('/auth', authRateLimit)` ya cubre las nuevas rutas automáticamente — no tocar `app.ts`.
- **Excepciones de dominio → HTTP:** Error handler en `error-handler.ts` mapea excepciones a HTTP. `BadRequestException` → 400 debe añadirse igual que `GeocodingException`.
- **Review finding de 1.3 (JwtService.verify sin mapeo):** Ya resuelto en 1.4. No relevante aquí.
- **`typeof` checks en middleware:** El `authMiddleware` (1.4) ya valida `jwtVersion` numérico. En reset-password no usamos el middleware — solo el hash del token.

---

### Contexto de Rate Limiting a preservar

- `app.use('/auth', authRateLimit)` en `app.ts` ya aplica 10 req/IP/15min a `/auth/forgot-password` y `/auth/reset-password` automáticamente.
- No agregar rate limiting adicional en estas rutas — el límite global cubre el caso de abuso.
- El AC #5 (JWT antiguo → 401 después del reset) lo garantiza el `authMiddleware` de 1.4 sin cambios — `jwt_version` se incrementa en la transacción, por lo que `jwtVersion` del token antiguo ya no coincide.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Sin bloqueos durante la implementación.

### Completion Notes List

- BadRequestException creada y registrada en error handler antes que ConflictException (orden importante).
- Transacción atómica gestionada íntegramente en PostgresPasswordResetTokenRepository.markUsedAndResetUserPassword usando db.connect()/BEGIN/COMMIT/ROLLBACK/release — los use cases no conocen detalles de transaccionalidad.
- ForgotPasswordUseCase siempre retorna 200 con el mismo mensaje; el bloque de creación de token y envío de email está envuelto en `if (user)` — anti-enumeración garantizada.
- Token raw de 64 chars hex (randomBytes(32)); token almacenado es SHA-256 del raw (64 chars hex). El DB nunca almacena el token crudo.
- Enlace de reset usa env.CORS_ORIGIN sin agregar nueva variable de entorno.
- ResendMailProvider refactorizado con mapa de plantillas; fallback genérico si templateId desconocido.
- 17 tests creados en auth-password-reset.test.ts; suite completa: 55/55 passing.

### File List

- src/domain/exceptions/bad-request.exception.ts (nuevo)
- src/interfaces/http/middlewares/error-handler.ts (modificado)
- src/infrastructure/database/supabase/migrations/002-create-password-reset-tokens.sql (nuevo)
- src/domain/entities/password-reset-token.entity.ts (nuevo)
- src/domain/repositories/password-reset-token.repository.ts (nuevo)
- src/infrastructure/database/supabase/password-reset-token.repository.ts (nuevo)
- src/application/dtos/password-reset.dto.ts (nuevo)
- src/application/use-cases/user/forgot-password.use-case.ts (nuevo)
- src/application/use-cases/user/reset-password.use-case.ts (nuevo)
- src/interfaces/validators/forgot-password.validator.ts (nuevo)
- src/interfaces/validators/reset-password.validator.ts (nuevo)
- src/interfaces/http/controllers/auth.controller.ts (modificado)
- src/interfaces/http/routes/auth.routes.ts (modificado)
- src/infrastructure/email/resend.provider.ts (modificado)
- tests/auth-password-reset.test.ts (nuevo)

## Change Log

- Implementación completa de historia 1.5 — 2026-05-05
  - 10 archivos nuevos, 4 modificados
  - 55/55 tests pasando (17 nuevos en auth-password-reset.test.ts)

---

### Review Findings

- [x] [Review][Decision] Timing oracle distingue email registrado vs no registrado — **Decisión: aceptar el riesgo.** El rate limit de 10 req/IP/15min en app.ts es suficiente mitigación para este proyecto. [src/application/use-cases/user/forgot-password.use-case.ts]

- [x] [Review][Patch] TOCTOU — dos requests simultáneos con el mismo token ambos pasan la validación `used=false` y ambos ejecutan el reset. Falta un guard atómico: `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1 AND used = FALSE` con verificación de `rowCount` [src/infrastructure/database/supabase/password-reset-token.repository.ts]

- [x] [Review][Patch] Tokens previos no se invalidan al crear uno nuevo — cada llamada a forgot-password crea un token adicional sin invalidar los anteriores. Un token robado de un email anterior sigue siendo válido. Solución: eliminar tokens activos del usuario antes de insertar uno nuevo [src/application/use-cases/user/forgot-password.use-case.ts]

- [x] [Review][Patch] Campo `token` sin max length ni validación de formato — el validator solo tiene `z.string().min(1)` pero el token válido es siempre 64 chars hex. Un string arbitrariamente largo llega al SHA-256 del event loop. Solución mínima: agregar `.max(256)`; solución exacta: `.length(64).regex(/^[0-9a-f]+$/)` [src/interfaces/validators/reset-password.validator.ts]

- [x] [Review][Patch] SQL migration sin `IF NOT EXISTS` — re-ejecutar la migración falla con error hard. Solución: `CREATE TABLE IF NOT EXISTS password_reset_tokens` y `CREATE INDEX IF NOT EXISTS` [src/infrastructure/database/supabase/migrations/002-create-password-reset-tokens.sql]

- [x] [Review][Defer] Silent success si usuario es borrado entre `findById` y la transacción — ON DELETE CASCADE borra el token al borrar el user, pero en la ventana entre findById y markUsedAndResetUserPassword ambos UPDATEs afectan 0 filas y el commit sucede, retornando 200 sin efecto. Riesgo mínimo en producción. — deferred, edge case de probabilidad negligible

- [x] [Review][Defer] AC#5 sin test de integración explícito en esta historia — el jwt_version se incrementa correctamente en la transacción pero no hay test que emita un JWT, complete el reset, y verifique que el JWT antiguo retorna 401. Cubierto por diseño (story 1.4 ya testea el middleware). — deferred, cubierto por diseño
