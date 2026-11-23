# technical-design-backend.md
**Versión:** 1.9  
**Estado:** Listo para consumo por agente BMAD  
**Fecha:** Junio 2026  
**Scope:** Backend exclusivamente — Node.js / Clean Architecture / Supabase

> Versión 1.9 — Correct Course 2026-06-09: Sistema de Reportes (Épica 14 / PRD-REP-BE-01) — tabla `reports` (§3.10), vista `reports_summary_by_entity` (§3.11), índices de reportes (§4), Job 6 anonimización mensual RGPD (§7), carpetas de módulo (§2), TPL-011…TPL-013 y TPL-ADM-002 (§10), `reportRateLimit` (§11.1), autorización `CreateReport` y `AdminResolveReport` (§12.10–12.11), AE-032 y AE-033 (§12.9). `analytics_events` catálogo ampliado a AE-001…AE-033.
> Versión 1.8 — Correct Course 2026-06-15: Descubrimiento Público y SEO (Épica 13) — endpoints `GET /items` y `GET /items/:id` con autenticación opcional (§8.7), Feed Global para invitados (§12.12), Anonimización de donante en vista pública (§12.13), cabecera `410 Gone` para objetos purgados (§8.7).
>
> Versión 1.7 — Correct Course 2026-05-31: canal de contacto del candidato (épica 12) — `item_requests.contact_channel` (§3.4), `delivery_sessions.receiver_contact_channel`/`receiver_contact_purged` (§3.5), índice `idx_sessions_contact_purge` ampliado con OR (§4), Job 3 purga ambos canales, §12.2c SEC-002c (`receiverContactChannel`), §12.4 `contactChannel` obligatorio en `RequestItem`, §12.7 secuencia `SelectReceiver` con copia y purga.
>
> Versión 1.6 — Correct Course 2026-05-29: digest horario EVT-015 / TPL-010 — columna `digest_notified_at` e índice en `items` (§3.2, §4), `POST /api/jobs/nearby-items-digest`, `CRON_SECRET`, `cronAuthMiddleware`, rate limit `/jobs/*` (§11.1), §7.6 job HTTP. Excepción documentada a NFR14 para este disparador externo.
>
> Versión 1.5 — Verificación de email en registro: columnas de token en `users` (§3.1), índice parcial (§4), flujo de registro ampliado y middleware `emailVerified` (§8.2–8.3), endpoints `GET /auth/verify-email` y `POST /auth/resend-verification` (§8.6), EVT-014 / TPL-009 (§10), nota transversal en §12.
>
> Versión 1.4 — Delta DLT-004: capa de analítica e instrumentación (PRD Analítica v1.0).
> Cambios respecto a v1.3: columnas `category` y `weight_range` en `items` (§3.2), `config/loggers.ts` y `analytics.service` (§2), instrumentación AE-001…AE-031 en use cases y jobs (§12.9), contrato de publicación ampliado (§8).
>
> Versión 1.3 — Delta DLT-003: ampliación del modelo de usuario (identidad, avatar, contacto, control operativo, i18n).
> Cambios respecto a v1.2: siete columnas en `users` (§3.1), flujos de registro y middleware `is_active` (§8.2–8.3), contratos de auth/perfil y `PATCH /users/me` (§8.5), saludo `{{firstName}}` en templates TPL-001–TPL-008 (§10).
>
> Versión 1.2 — Incorpora correcciones del Informe de Auditoría de Seguridad v1.0.
> Cambios respecto a v1.1: campo `jwt_version` en tabla `users` (SEC-004), Job 5 reescrito con CTE atómico (SEC-006), sección nueva §12 Reglas de Autorización por Use Case (SEC-001, SEC-002, SEC-005), nota de transacción serializable en §3.4 (SEC-003), nota de DTOs explícitos en §2 (SEC-008), rate limit de ranking añadido en §11 (SEC-009), configuración de Helmet.js añadida en §11 (SEC-010), validación UUID en §2 (SEC-007).

---

## 1. Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Runtime | Node.js |
| Arquitectura | Clean Architecture |
| Base de datos | Supabase (PostgreSQL + PostGIS) |
| Almacenamiento | Supabase Storage |
| Autenticación | JWT custom (7 días) + reCAPTCHA V3 |
| Email | Resend |
| Caché | LRU Cache en memoria del backend |
| Hosting | Railway |
| Jobs periódicos | pg_cron |
| Hash contraseñas | Argon2 |
| Logging | pino |
| Geocodificación | Nominatim (OpenStreetMap) + LRU Cache |
| Rate limiting | express-rate-limit |
| Cabeceras de seguridad HTTP | helmet |

---

## 2. Estructura de Carpetas (Clean Architecture)

```
src/
├── domain/
│   ├── entities/          # User, Item, DeliverySession, Report
│   ├── repositories/      # Interfaces de repositorios (contratos) — incluye IReportRepository
│   └── value-objects/     # ReputationScore, GeoLocation, etc.
│
├── application/
│   ├── use-cases/
│   │   ├── user/
│   │   ├── item/
│   │   ├── delivery/
│   │   └── reports/       # CreateReportUseCase, AdminGetReportsUseCase,
│   │                      # AdminGetReportByIdUseCase, AdminResolveReportUseCase
│   ├── services/          # RankingService, ReputationService, GeocodingService, analytics.service
│   └── dtos/              # Objetos de transferencia de datos — incluye report/
│                          # (CreateReportDto, ReportListDto, ReportDetailDto, ResolveReportDto)
│
├── infrastructure/
│   ├── database/
│   │   ├── supabase/      # Implementaciones de repositorios en PostgreSQL
│   │   │                  # — incluye report.repository.ts
│   │   └── cache/         # Implementación LRU Cache
│   ├── email/             # Adaptador Resend
│   ├── storage/           # Adaptador Supabase Storage (incluye borrado físico y procesamiento de cola)
│   ├── geocoding/         # Adaptador Nominatim + LRU Cache
│   └── security/          # JWT, reCAPTCHA, hash de contraseñas
│
├── interfaces/
│   ├── http/
│   │   ├── controllers/   # Controladores por dominio
│   │   │                  # — incluye ReportController (público) y AdminReportController (admin)
│   │   ├── middlewares/   # Auth, rate limiting (global + auth + ranking), helmet, errores, CORS
│   │   └── routes/        # Definición de rutas — incluye reports.routes.ts
│   │                      # (admin.routes.ts extendido con rutas de reportes admin)
│   └── validators/        # Validación de entrada — incluye validación UUID en rutas :id
│                          # y report.validators.ts
│
├── config/                # Variables de entorno, constantes globales, loggers.ts
└── main.ts                # Entry point
```

**Regla de implementación — Loggers de aplicación y analítica (DLT-004):**

- `src/config/loggers.ts` exporta `appLogger` (`base: { service: 'app' }`) y `analyticsLogger` (`base: { service: 'analytics' }`).
- Errores HTTP, infraestructura y BD → `appLogger`. Eventos de negocio → `analyticsLogger` vía `emitEvent` en `application/services/analytics.service.ts`.
- Los dos loggers **nunca se mezclan**. `pinoHttp` y el entry point usan `appLogger`.
- `emitEvent(event, userId, properties, sessionId?)` hashea `userId` con SHA-256; se invoca **solo tras commit** de la transacción; fire-and-forget (sin await ni revertir operación de negocio).
- **Dual-write MVP:** cada emisión escribe en `analyticsLogger` (stdout) y, si `ANALYTICS_PERSISTENCE=postgres`, inserta en `analytics_events` de forma asíncrona.
- `properties` no debe contener: coordenadas exactas, email, `contact_channel`, ni UUID de usuario en crudo.
- Catálogo completo de eventos: `docs/prd-analytics.md` y `docs/delta-backend-DLT-004.md` §D.

**Regla de implementación — DTOs explícitos (SEC-008):**
Todos los use cases deben retornar tipos DTO explícitos definidos en `application/dtos/`. Está prohibido serializar entidades de dominio directamente en respuestas HTTP ni usar `SELECT *` como fuente de respuesta. El campo `location` (GEOGRAPHY POINT) nunca debe aparecer en ningún DTO de salida. Solo `distanceMeters` (calculado en SQL) puede exponerse como referencia geográfica.

**Regla de implementación — Validación UUID (SEC-007):**
Todos los parámetros de ruta `:id` (item_id, session_id, user_id, request_id) deben validarse como UUID v4 en la capa `validators/` antes de llegar al controlador. Si el formato no es válido, retornar HTTP 400 con mensaje genérico. Nunca propagar el valor malformado a una consulta SQL.

---

## 3. Modelo de Datos (PostgreSQL / PostGIS)

**Row Level Security (RLS):** Todas las tablas de aplicación en `public` tienen RLS activado sin políticas para los roles `anon` y `authenticated`, de modo que la Data API de Supabase no puede leer ni escribir filas de negocio. La autorización sobre recursos concretos sigue en los use-cases (§12, BOLA) con JWT custom; el pool `pg` (`DATABASE_URL`) y `service_role` operan con bypass RLS. Migración: `019-enable-rls-lockdown-public.sql`.

### 3.1 Tabla `users`

```sql
CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT NOT NULL UNIQUE,
  password_hash             TEXT NOT NULL,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  avatar_url                TEXT,
  phone                     TEXT,
  postal_code               TEXT NOT NULL,
  location                  GEOGRAPHY(POINT, 4326) NOT NULL,
  reputation_score          INTEGER NOT NULL DEFAULT 0,
  total_received            INTEGER NOT NULL DEFAULT 0,
  total_donated             INTEGER NOT NULL DEFAULT 0,
  consecutive_no_shows      INTEGER NOT NULL DEFAULT 0,
  cycles_at_limit           INTEGER NOT NULL DEFAULT 0,
  last_cycle_incremented_at TIMESTAMPTZ,
  jwt_version               INTEGER NOT NULL DEFAULT 1,
  email_verified                BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token_hash       TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  verification_resend_at        TIMESTAMPTZ,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_language        TEXT NOT NULL DEFAULT 'es',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at            TIMESTAMPTZ
);
```

**Notas:**
- `location` usa tipo `GEOGRAPHY` de PostGIS — permite consultas de radio directamente en SQL.
- `reputation_score` es campo calculado y actualizado por eventos. Es la fuente de verdad operativa.
- `request_count_30d` **no existe** — el límite se verifica mediante ventana deslizante de 720 horas sobre `item_requests`.
- `last_cycle_incremented_at` — garantiza que `cycles_at_limit` se incremente como máximo una vez cada 30 días.
- `is_hidden` y `report_count` eliminados del MVP.
- `jwt_version` (SEC-004) — se incluye como claim `jwtVersion` en el JWT al generarlo. El middleware de autenticación verifica que el claim del token coincide con el valor en base de datos. Al ejecutar `reset-password` o al cambiar `postalCode` vía `PATCH /users/me`, se incrementa `jwt_version` en la misma transacción atómica, invalidando todos los tokens previos del usuario.
- `first_name` / `last_name` — obligatorios en registro. Mínimo 2 caracteres, máximo 50. Solo letras y caracteres Unicode válidos (acentos, ñ, ç). Validación en capa `validators/`.
- `avatar_url` — URL pública de Supabase Storage. Bucket `avatars/` (público). Ruta `avatars/{user_id}/{filename}`. Ciclo de vida manual (sin purga pg_cron).
- `phone` — opcional, texto libre, máximo 20 caracteres. Solo visible en `GET /users/me`; nunca en DTOs públicos.
- `email_verified` — fuente de verdad en BD. Se establece en `TRUE` tras verificación exitosa vía `GET /auth/verify-email`. Expuesto en `GET /users/me`; no modificable por otros endpoints.
- `verification_token_hash` / `verification_token_expires_at` — se establecen juntos en registro y reenvío; se limpian juntos tras verificación exitosa o al emitir nuevo token. Solo se almacena hash SHA-256 del token; el token en texto plano solo existe en el enlace del email.
- `verification_resend_at` — timestamp del último envío (registro o reenvío). Controla cooldown de 30 segundos entre reenvíos.
- `is_active` — uso interno exclusivo. Nunca en DTOs de respuesta. El middleware lo verifica tras `jwt_version`; si `FALSE` → HTTP 401.
- `preferred_language` — MVP: único valor `'es'`. `ResendMailProvider` ramifica templates sobre este campo sin cambios de schema futuros.

---

### 3.2 Tabla `items`

```sql
CREATE TABLE items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id        UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  condition       TEXT NOT NULL,
  category        TEXT NOT NULL
                  CHECK (category IN (
                    'furniture','electronics','clothing','books',
                    'toys','kitchen','sports','tools','other'
                  )),
  weight_range    TEXT NOT NULL
                  CHECK (weight_range IN ('lt1','1to5','5to20','gt20')),
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at           TIMESTAMPTZ,
  digest_notified_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
```

**Notas:**
- `expires_at` eliminado — sin comportamiento definido en el MVP.
- `category` — obligatorio en publicación. Valores: `furniture`, `electronics`, `clothing`, `books`, `toys`, `kitchen`, `sports`, `tools`, `other`. Usado en eventos de analítica; no requiere índice en MVP.
- `weight_range` — obligatorio en publicación. Valores: `lt1`, `1to5`, `5to20`, `gt20`. Pesos estimados ESG solo para agregados futuros; **no** exponer en DTOs de respuesta por ítem.
- Migración en entornos con datos: backfill `category = 'other'`, `weight_range = 'lt1'` antes de aplicar NOT NULL (ver `delta-backend-DLT-004.md`).
- `requests_paused` — el donante puede pausar temporalmente las nuevas solicitudes mientras el objeto está `active`. Controlado mediante `PATCH /items/:id/pause`. Si `TRUE`, `POST /items/:id/requests` retorna 409.
- `degraded_at` se establece por `pg_cron` cuando el objeto lleva 7 días en estado `active` sin selección de receptor.
- `digest_notified_at` — `NULL` hasta incluir el objeto en un digest EVT-015. Se establece **antes** del envío de emails (idempotencia). Objetos existentes pre-migración no entran en digest retroactivo.
- `location` propio del objeto — puede diferir de la ubicación del donante.

---

### 3.3 Tabla `item_images`

```sql
CREATE TABLE item_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**
- Máximo 5 registros por `item_id` — validado en el use case de publicación.
- `storage_path` referencia la ruta en Supabase Storage.
- Las imágenes de objetos en `completed` o `cancelled` se purgan a los 30 días del cambio de estado via `pg_cron`.
- El borrado físico en Supabase Storage se gestiona mediante trigger + tabla de cola `storage_deletion_queue`. Ver § 3.8.
- Los repositorios que devuelvan imágenes deben comprobar si el objeto cumple `status IN ('completed', 'cancelled') AND completed_at < NOW() - INTERVAL '30 days'`; en ese caso, retornar `images: []` aunque el job no haya ejecutado aún.

---

### 3.4 Tabla `item_requests`

```sql
CREATE TABLE item_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES items(id),
  requester_id    UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','selected','rejected','cancelled')),
  contact_channel TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);
```

**Verificación de límite — Sliding Window (720 horas):**

```typescript
// Use case: RequestItem
const recentRequests = await itemRequestRepo.countByRequesterInWindow(
  userId,
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
);
if (recentRequests >= 3) throw new LimitExceededException();
```

**Nota de atomicidad (SEC-003):**
La verificación del límite de 3 solicitudes y la inserción del nuevo registro deben ejecutarse dentro de una única transacción con nivel de aislamiento `SERIALIZABLE` para prevenir condiciones de carrera en accesos concurrentes. El `UNIQUE constraint` de la tabla previene duplicados por objeto, pero no el límite global de solicitudes por usuario en la ventana de 30 días.

**Nota — `contact_channel` (épica 12):**
Obligatorio en `RequestItem` a nivel de use case (validación `interfaces/validators/`); nullable en BD para compatibilidad con solicitudes legacy anteriores al deploy de 12-1. Se purga a `NULL` dentro de la transacción de `SelectReceiver` —tanto en la solicitud seleccionada (tras copiarse a `delivery_sessions`) como en todas las rechazadas. Pasada esa transacción, ninguna fila de `item_requests` retiene datos de contacto.

---

### 3.5 Tabla `delivery_sessions`

```sql
CREATE TABLE delivery_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                   UUID NOT NULL REFERENCES items(id),
  donor_id                  UUID NOT NULL REFERENCES users(id),
  receiver_id               UUID NOT NULL REFERENCES users(id),
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel           TEXT,
  contact_purged            BOOLEAN NOT NULL DEFAULT FALSE,
  receiver_contact_channel  TEXT,
  receiver_contact_purged   BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed           BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at               TIMESTAMPTZ NOT NULL
                            DEFAULT NOW() + INTERVAL '7 days',
  completed_at              TIMESTAMPTZ
);
```

**Flujo de cierre de sesión:**

```
Donante confirma entrega
  └─ donor_confirmed = TRUE
     └─ status = 'completed'
        └─ completed_at = NOW()
           └─ donante: +15 si primera donación, si no +10; receptor: +1
           └─ total_donated++ (donante)
           └─ total_received++ (receptor)
           └─ consecutive_no_shows = 0 (ambos)
           └─ reputation_events con role donor/receiver

Donante declara no-show del receptor
  └─ no_show_declared = TRUE
     └─ status = 'cancelled'
        └─ completed_at = NOW()
           └─ evento no_show registrado para el receptor (role = 'receiver')
           └─ consecutive_no_shows++ (receptor)
           └─ delta = -10 × consecutive_no_shows (receptor)
           └─ objeto vuelve a status = 'active'

Deadline alcanzado sin confirmación ni declaración
  └─ status = 'expired'
     └─ objeto vuelve a status = 'active'
        └─ sin penalización
           └─ notificación por email al donante
```

---

### 3.6 Tabla `reputation_events`

```sql
CREATE TABLE reputation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL
             CHECK (type IN ('delivery_completed','no_show')),
  delta      INTEGER NOT NULL,
  session_id UUID REFERENCES delivery_sessions(id),
  role       VARCHAR(8) CHECK (role IN ('donor','receiver')) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**
- Tabla de auditoría exclusivamente — no se usa para recalcular scores.
- `reputation_score` en `users` es la fuente de verdad operativa.
- El evento `no_show` se registra únicamente cuando `no_show_declared = TRUE`.
- **MIGR-001:** columna `role` distingue donante/receptor en `delivery_completed` y marca `receiver` en `no_show`. Filas históricas anteriores a la migración pueden tener `role = NULL`.

---

### 3.7 Tabla `password_reset_tokens`

```sql
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
             DEFAULT NOW() + INTERVAL '1 hour',
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 3.8 Tabla `storage_deletion_queue`

```sql
CREATE TABLE storage_deletion_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
```

**Trigger asociado:**

```sql
CREATE OR REPLACE FUNCTION fn_queue_storage_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO storage_deletion_queue (storage_path)
  VALUES (OLD.storage_path);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_queue_storage_deletion
AFTER DELETE ON item_images
FOR EACH ROW EXECUTE FUNCTION fn_queue_storage_deletion();
```

**Lógica de polling en el adaptador (StorageAdapter):**

```typescript
// Ejecutado al arranque y cada 10 minutos
async function processDeletionQueue(): Promise<void> {
  const pending = await db.query<{ id: string; storage_path: string }>(
    `SELECT id, storage_path FROM storage_deletion_queue
     WHERE processed_at IS NULL
     ORDER BY created_at ASC
     LIMIT 100`
  );

  for (const row of pending.rows) {
    await supabaseStorageClient.remove([row.storage_path]);
    await db.query(
      `UPDATE storage_deletion_queue
       SET processed_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
  }
}
```

**Notas:**
- El job de `pg_cron` (Job 2) elimina el registro en `item_images`. El trigger inserta el `storage_path` en la cola. El adaptador de Storage procesa la cola de forma asíncrona.
- Si el servidor está caído en el momento de la purga, los registros permanecen en la cola con `processed_at IS NULL` y se procesan en el siguiente arranque.

---

### 3.9 Tabla `analytics_events` (DLT-004 — persistencia MVP)

```sql
CREATE TABLE analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event         TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  user_id_hash  TEXT NOT NULL CHECK (char_length(user_id_hash) = 64),
  session_id    UUID,
  properties    JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**

- Almacén durable del catálogo AE-001…AE-031. Sin FK a `users` (privacidad y desacoplamiento).
- `user_id_hash` = SHA-256 hex del UUID del actor (mismo valor que en logs Pino).
- `occurred_at` = instante del evento de negocio (no confundir con `created_at` de inserción).
- Solo el backend inserta (service role). Sin endpoints REST.
- Fallo de insert no revierte operación de negocio ya commiteada.

---

### 3.10 Tabla `reports`

```sql
CREATE TABLE reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_entity_type  TEXT NOT NULL
                        CHECK (reported_entity_type IN ('item', 'user')),
  reported_entity_id    UUID NOT NULL,
  reason                TEXT NOT NULL
                        CHECK (reason IN (
                          'contenido_inadecuado',
                          'fraude_o_enganio',
                          'spam',
                          'objeto_ilegal',
                          'objeto_peligroso',
                          'información_falsa',
                          'comportamiento_abusivo',
                          'otro'
                        )),
  description           TEXT CHECK (char_length(description) <= 500),
  entity_snapshot       JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'resolved', 'archived')),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES admin_users(id),
  resolution_action     TEXT CHECK (resolution_action IN (
                          'archive', 'warn_user', 'cancel_item', 'suspend_user'
                        )),
  resolution_note       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas del modelo:**

- `reporter_id`: `ON DELETE SET NULL` — si la cuenta del denunciante es eliminada, el reporte permanece con `reporter_id = NULL`. Mismo mecanismo usado por el job de anonimización RGPD (Job 6, §7).
- `reported_entity_id`: sin FK explícita por diseño (asociación polimórfica — D-REP-08). La existencia de la entidad se verifica en el use case antes del INSERT.
- `entity_snapshot`: captura el estado relevante de la entidad en el momento del reporte:
  - **Para `item`:** `{ "entityType": "item", "title": string, "status": string, "category": string, "description": string (max 300 chars) }`
  - **Para `user`:** `{ "entityType": "user", "firstName": string, "lastName": string, "reputationScore": integer }`
- `resolution_action`: `NULL` cuando `status = 'pending'`. Obligatorio al resolver o archivar.
- `resolution_note`: texto libre obligatorio al resolver o archivar. Documentación interna del admin.
- `resolved_by`: FK a `admin_users.id`. `NULL` mientras `status = 'pending'`.
- Máquina de estados: `pending → resolved` (acciones `warn_user`, `cancel_item`, `suspend_user`) o `pending → archived` (acción `archive`). Los reportes cerrados son inmutables.
- Entidades reportables en v1: objetos (`items`) y perfiles de usuario (`users`). Estados reportables de objetos: `active`, `reserved`, `completed`. Estado `cancelled`: no reportable.
- RLS habilitado: política `reports_select_own` permite al denunciante ver sus propios reportes. El denunciado no tiene política SELECT — la ausencia es deliberada (D-REP-06): el denunciado no puede enumerar los reportes en su contra.

---

### 3.11 Vista `reports_summary_by_entity`

```sql
CREATE VIEW reports_summary_by_entity AS
SELECT
  reported_entity_type,
  reported_entity_id,
  COUNT(*)                                          AS total_reports,
  COUNT(*) FILTER (WHERE status = 'pending')        AS pending_reports,
  COUNT(*) FILTER (WHERE status = 'resolved')       AS resolved_reports,
  COUNT(*) FILTER (WHERE status = 'archived')       AS archived_reports,
  MAX(created_at)                                   AS last_report_at
FROM reports
GROUP BY reported_entity_type, reported_entity_id;
```

**Propósito:** el campo `pendingCountForEntity` en `GET /api/admin/reports` se resuelve con un JOIN sobre esta vista, permitiendo detectar entidades con múltiples reportes pendientes sin lógica de aplicación adicional.

---

## 4. Índices

```sql
-- Consultas geoespaciales (radio 50 km)
CREATE INDEX idx_items_location ON items USING GIST(location);
CREATE INDEX idx_users_location ON users USING GIST(location);

-- Filtrado por estado frecuente
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_requests_item ON item_requests(item_id);

-- Sliding window para límite de solicitudes
CREATE INDEX idx_requests_requester_date
  ON item_requests(requester_id, created_at);

-- Degradación por inactividad
CREATE INDEX idx_items_degraded
  ON items(status, created_at)
  WHERE status = 'active' AND degraded_at IS NULL;

-- Digest horario EVT-015
CREATE INDEX idx_items_digest_pending
  ON items(created_at)
  WHERE digest_notified_at IS NULL
    AND status = 'active';

-- Jobs de purga
CREATE INDEX idx_item_images_item ON item_images(item_id);
CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE
     OR receiver_contact_purged = FALSE;

-- Cola de borrado de Storage
CREATE INDEX idx_storage_deletion_queue_pending
  ON storage_deletion_queue(created_at)
  WHERE processed_at IS NULL;

-- Historial por usuario
CREATE INDEX idx_reputation_events_user ON reputation_events(user_id);
CREATE INDEX idx_delivery_sessions_donor ON delivery_sessions(donor_id);
CREATE INDEX idx_delivery_sessions_receiver ON delivery_sessions(receiver_id);

-- Control de ciclos
CREATE INDEX idx_users_cycle_increment
  ON users(last_cycle_incremented_at)
  WHERE cycles_at_limit > 0;

-- Analítica (consultas por evento, tiempo y usuario hasheado)
CREATE INDEX idx_analytics_events_event ON analytics_events(event);
CREATE INDEX idx_analytics_events_occurred_at ON analytics_events(occurred_at DESC);
CREATE INDEX idx_analytics_events_user_hash ON analytics_events(user_id_hash);

-- Búsqueda de usuario por token de verificación (GET /auth/verify-email)
CREATE INDEX idx_users_verification_token
  ON users(verification_token_hash)
  WHERE email_verified = FALSE;

-- Módulo de reportes (Épica 14)
-- Cola admin: filtro por estado + orden cronológico
CREATE INDEX idx_reports_status_created
  ON reports(status, created_at ASC);

-- Contexto por entidad: detección de patrones, pendingCountForEntity
CREATE INDEX idx_reports_entity
  ON reports(reported_entity_type, reported_entity_id);

-- Validación de duplicados y límites anti-spam (D-REP-04)
CREATE INDEX idx_reports_reporter_created
  ON reports(reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

-- Lookup por denunciante: historial en detalle de reporte admin
CREATE INDEX idx_reports_reporter_id
  ON reports(reporter_id)
  WHERE reporter_id IS NOT NULL;
```

---

## 5. Sistema de Reputación

> Fuente de verdad: [ranking-spec-v1.0.md](./ranking-spec-v1.0.md) §7–§9 (RFC-001 a RFC-004).

### 5.1 Eventos y deltas

| Evento | Delta |
|---|---|
| Entrega completada — donante (ya donó antes) | +10 |
| Entrega completada — donante (primera donación histórica) | +15 |
| Entrega completada — receptor | +1 |
| No-show (receptor) | -10 × `consecutive_no_shows` |

**Reglas:**
- Sin valor mínimo — el score puede ser negativo sin límite.
- Penalización acumulativa: cada no-show consecutivo multiplica la base -10 por el contador en ese momento.
- El contador `consecutive_no_shows` se resetea a 0 al completar una entrega exitosa (donante y receptor).
- Recuperación exclusivamente por actividad positiva — sin recuperación pasiva por tiempo.

### 5.2 Lógica de aplicación (ConfirmDelivery / CancelDelivery)

Implementación en `delivery-session.repository.ts`. Pseudocódigo alineado con spec §7:

```typescript
function onDeliveryCompleted(donor: User, receiver: User, sessionId: string): void {
  const donorDelta = donor.totalDonated === 0 ? 15 : 10;
  donor.consecutiveNoShows = 0;
  donor.reputationScore += donorDelta;
  donor.totalDonated += 1;

  receiver.consecutiveNoShows = 0;
  receiver.reputationScore += 1;
  receiver.totalReceived += 1;

  insertReputationEvent({ userId: donor.id, type: 'delivery_completed', role: 'donor', delta: donorDelta, sessionId });
  insertReputationEvent({ userId: receiver.id, type: 'delivery_completed', role: 'receiver', delta: 1, sessionId });
}

function onNoShow(receiver: User, sessionId: string): ReputationEvent {
  receiver.consecutiveNoShows += 1;
  const delta = -10 * receiver.consecutiveNoShows;
  receiver.reputationScore += delta;
  insertReputationEvent({ userId: receiver.id, type: 'no_show', role: 'receiver', delta, sessionId });
  return { type: 'no_show', delta };
}
```

`reputation.service.ts` emite eventos analíticos AE-030 con los deltas reales tras commit.

### 5.3 Fórmula resumida

```
reputation_score(t) =
  0
  + [+15 si primera donación como donante, +10 en entregas subsiguientes como donante]
  + Σ(entregas como receptor) × (+1)
  + Σ(no_shows como receptor) × (-10 × consecutividad_en_ese_momento)

Sin floor. Sin recuperación pasiva.
```

---

## 6. Algoritmo de Ranking

### 6.1 Orden de criterios

1. Reputación (`reputation_score` efectivo)
2. Cercanía geográfica
3. Antigüedad de la solicitud

### 6.2 Propiedades

- Calculado en tiempo real al visualizar solicitudes.
- No determinista: perturbación aleatoria de ±2 puntos sobre el score efectivo en cada cálculo.
- Excluye usuarios pasivos del ranking.

### 6.3 Consulta SQL de ranking en tiempo real

Implementación canónica en `request.repository.ts` → `findRankedCandidates`. Constantes compartidas en `ranked-candidate-filters.ts`.

```sql
SELECT request_id, user_id, first_name, last_name, reputation_score, distance_meters, request_date
FROM (
  SELECT
    ir.id AS request_id,
    ir.requester_id AS user_id,
    u.first_name,
    u.last_name,
    u.reputation_score,
    ROUND(ST_Distance(i.location, u.location))::int AS distance_meters,
    ir.created_at AS request_date,
    (
      u.reputation_score
      + FLOOR(RANDOM() * 5 - 2)::int
      - CASE
          WHEN (u.cycles_at_limit >= 1 AND u.total_donated = 0)
          THEN 15
          ELSE 0
        END
    ) AS effective_score
  FROM item_requests ir
  JOIN users u ON u.id = ir.requester_id
  JOIN items i ON i.id = ir.item_id
  WHERE ir.item_id = $1
    AND ir.status = 'pending'
    AND NOT (
      u.total_donated = 0
      AND u.total_received > 0
      AND u.last_active_at IS NOT NULL
      AND u.last_active_at < NOW() - INTERVAL '60 days'
    )
    AND NOT (
      u.cycles_at_limit >= 2
      AND u.total_donated = 0
    )
) ranked
ORDER BY effective_score DESC, distance_meters ASC, request_date ASC;
```

**Notas:**
- **RFC-003 Tier 1:** penalización -15 en `effective_score` cuando `cycles_at_limit >= 1 AND total_donated = 0`.
- **RFC-003 Tier 2:** exclusión en `WHERE` cuando `cycles_at_limit >= 2 AND total_donated = 0`.
- **FR17:** exclusión usuario pasivo (mismo bloque `NOT (...)`).
- **Perturbación:** `FLOOR(RANDOM() * 5 - 2)` → entero entre -2 y +2.
- **Distancia:** `ST_Distance` solo ordena; **no** hay filtro `ST_DWithin` en la implementación actual. La spec §8 incluye `ST_DWithin(u.location, i.location, 50000)` como referencia; el código no excluye candidatos por radio — las solicitudes `pending` ya implican interés en el objeto.

**Nota de escalabilidad:** si p95 > 500ms en esta consulta, se implementará una vista materializada de `effective_score` actualizada por triggers. Optimización diferida deliberadamente para MVP.

**Guías de ranking y reputación:** [producto](./ranking-guia-producto.md) · [técnica](./ranking-system.md) · [spec v1.0](./ranking-spec-v1.0.md) (puntos, ranking, APIs, SQL). Requisitos de puntos: [prd.md](./prd.md) §10.

### 6.4 Detección de usuario pasivo (exclusión del ranking)

```
total_donated = 0
AND total_received > 0
AND last_active_at IS NOT NULL
AND last_active_at < NOW() - INTERVAL '60 days'
```

`last_active_at` NULL no cuenta como pasivo (evita exclusión accidental en SQL). El contador `requestCount` en «mis objetos» usa el mismo filtro que el ranking: **FR17 (pasivo) + RFC-003 Tier 2 (exclusión acaparador)** — constante `RANKED_ELIGIBLE_REQUESTER_SQL` en `ranked-candidate-filters.ts`.

Efecto: exclusión del ranking. No afecta `reputation_score`.

### 6.5 Detección de usuario acaparador (RFC-003 — supersede FR18)

Dos niveles independientes. Rehabilitación instantánea con `total_donated >= 1`.

**Tier 1 — penalización en orden:**

```
cycles_at_limit >= 1
AND total_donated = 0
```

Efecto: -15 puntos sobre el score efectivo en el ranking. El candidato **sigue visible**. No afecta `reputation_score` oficial.

**Tier 2 — exclusión total:**

```
cycles_at_limit >= 2
AND total_donated = 0
```

Efecto: no aparece en `candidates[]` ni en `requestCount`. No afecta `reputation_score` oficial.

> Detalle e interacción con FR17: [ranking-spec-v1.0.md §4](./ranking-spec-v1.0.md#4-rfc-003--nuevos-niveles-de-control-de-acaparador-reemplaza-fr18) · [ranking-system.md §4](./ranking-system.md#reglas-de-exclusión-acaparador-tier-2-rfc-003)

---

## 7. Jobs de pg_cron

### Job 1 — Degradación por inactividad de objetos

**Frecuencia:** cada hora

```sql
SELECT cron.schedule(
  'degrade-inactive-items',
  '0 * * * *',
  $$
    UPDATE items
    SET degraded_at = NOW()
    WHERE status = 'active'
      AND degraded_at IS NULL
      AND created_at < NOW() - INTERVAL '7 days'
      AND id NOT IN (
        SELECT item_id FROM item_requests
        WHERE status = 'selected'
      );
  $$
);
```

Impacto en búsqueda: objetos con `degraded_at IS NOT NULL` se ordenan al final via `ORDER BY degraded_at NULLS FIRST`.

---

### Job 2 — Purga de imágenes

**Frecuencia:** diaria a las 03:00 UTC

```sql
SELECT cron.schedule(
  'purge-item-images',
  '0 3 * * *',
  $$
    DELETE FROM item_images
    WHERE item_id IN (
      SELECT id FROM items
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < NOW() - INTERVAL '30 days'
    );
  $$
);
```

El trigger `trg_queue_storage_deletion` intercepta cada `DELETE` sobre `item_images` e inserta el `storage_path` en `storage_deletion_queue`. El adaptador de Storage procesa la cola de forma asíncrona. Ver § 3.8.

---

### Job 3 — Purga de `contact_channel`

**Frecuencia:** diaria a las 03:30 UTC

```sql
SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel          = NULL,
        contact_purged           = TRUE,
        receiver_contact_channel = NULL,
        receiver_contact_purged  = TRUE
    WHERE (contact_purged = FALSE OR receiver_contact_purged = FALSE)
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
```

La purga del `contact_channel` en `item_requests` (solicitudes rechazadas) ocurre dentro de la transacción de `SelectReceiver` — no se requiere job adicional para ese campo.

---

### Job 4 — Incremento de `cycles_at_limit`

**Frecuencia:** diaria a las 02:00 UTC

```sql
SELECT cron.schedule(
  'increment-cycles-at-limit',
  '0 2 * * *',
  $$
    UPDATE users
    SET
      cycles_at_limit           = cycles_at_limit + 1,
      last_cycle_incremented_at = NOW()
    WHERE id IN (
      SELECT requester_id
      FROM item_requests
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY requester_id
      HAVING COUNT(*) >= 3
    )
    AND (
      last_cycle_incremented_at IS NULL
      OR last_cycle_incremented_at < NOW() - INTERVAL '30 days'
    );
  $$
);
```

La condición sobre `last_cycle_incremented_at` garantiza que el contador se incremente como máximo una vez cada 30 días por usuario.

---

### Job 5 — Cierre automático de sesiones expiradas (SEC-006)

**Frecuencia:** cada hora a los 30 minutos

```sql
SELECT cron.schedule(
  'expire-delivery-sessions',
  '30 * * * *',
  $$
    WITH expired AS (
      UPDATE delivery_sessions
      SET status = 'expired'
      WHERE status = 'active'
        AND deadline_at < NOW()
      RETURNING item_id
    )
    UPDATE items
    SET status      = 'active',
        reserved_at = NULL
    WHERE id IN (SELECT item_id FROM expired);
  $$
);
```

**Nota de atomicidad (SEC-006):** reescrito con CTE para garantizar que la expiración de sesiones y la reactivación de objetos se ejecuten en una única operación atómica. Si el servidor falla durante la ejecución, ambas actualizaciones se revierten juntas, eliminando la posibilidad de objetos bloqueados en estado `reserved` sin sesión `active` asociada.

---

### Job HTTP — Digest de proximidad (EVT-015)

**Disparador:** cron externo (cron-job.org), no `pg_cron`. Excepción documentada a NFR14 — hosting serverless sin cron interno fiable para envío Resend agrupado.

| Parámetro | Valor |
|---|---|
| Ruta | `POST /api/jobs/nearby-items-digest` |
| Autenticación | Header `X-Cron-Secret` = `process.env.CRON_SECRET` (mín. 32 caracteres; generar con `openssl rand -hex 32`) |
| JWT de usuario | No requerido |
| Frecuencia externa | `0 * * * *` (cada hora en punto) |
| Use case | `SendNearbyItemsDigestUseCase` |
| Plantilla | TPL-010 |

**Flujo resumido:** objetos `active` con `digest_notified_at IS NULL` → usuarios elegibles (`is_active`, `email_verified`, `location` en radio 50 km, no donante) → marcar `digest_notified_at` → enviar un email TPL-010 por usuario (best-effort). Respuesta `200` aunque `emailsFailed > 0`.

**Operaciones:** configurar `CRON_SECRET` en Railway y en cron-job.org. Timeout recomendado del cron: 30 s.

---

### Job 6 — Anonimización mensual de `reporter_id` (RGPD)

**Frecuencia:** mensual (primer día del mes, 03:00 UTC)

```sql
SELECT cron.schedule(
  'anonymize-reporter-id',
  '0 3 1 * *',
  $$
    UPDATE reports
    SET reporter_id = NULL
    WHERE status IN ('resolved', 'archived')
      AND created_at < NOW() - INTERVAL '2 years'
      AND reporter_id IS NOT NULL;
  $$
);
```

**Registro:** el job escribe en `appLogger` el número de filas anonimizadas. No genera entrada en `admin_audit_log` (es un job de sistema, no una acción de admin).

**Nota:** los reportes en estado `pending` con más de 2 años de antigüedad son un estado anómalo. El job no los anonimiza — deben ser revisados y cerrados por el operador antes de que se aplique la retención.

---

## 8. Autenticación (JWT + reCAPTCHA V3)

### 8.1 Decisiones de diseño

| Parámetro | Valor |
|---|---|
| Duración JWT | 7 días |
| Transporte JWT | Header `Authorization: Bearer <token>` |
| Expiración enlace de recuperación | 1 hora |
| Hash de contraseñas | Argon2 |
| Umbral reCAPTCHA V3 | score ≥ 0.5 |
| Invalidación de JWT | Campo `jwt_version` en `users` + claim `jwtVersion` en el token |
| Expiración token de verificación de email | 24 horas |
| Cooldown de reenvío de verificación | 30 segundos |

### 8.2 Flujo de registro

```
POST /auth/register
  { email, password, firstName, lastName, postalCode, phone?, recaptchaToken }

  1. Verificar reCAPTCHA V3 (score ≥ 0.5)
  2. Verificar email único
  3. Hash password (Argon2)
  4. Geocodificar postalCode (LRU Cache → Nominatim)
  5. Rechazar si código postal no existe
  6. Generar token de verificación (crypto.randomBytes(32))
  7. Calcular verification_token_hash = SHA-256(token)
  8. Insertar usuario con:
       location geocodificada
       jwt_version = 1
       email_verified = FALSE
       verification_token_hash = <hash>
       verification_token_expires_at = NOW() + INTERVAL '24 hours'
       verification_resend_at = NOW()
       is_active = TRUE
       preferred_language = 'es'
  9. Enviar email EVT-014 (TPL-009) con enlace de verificación y saludo de bienvenida breve
 10. Generar JWT incluyendo claim jwtVersion = 1
 11. Devolver JWT + DTO usuario
```

**Nota:** el enlace de verificación en TPL-009 usa `{APP_PUBLIC_URL}/verificar-email?token={token_raw}`. La SPA llama a `GET /auth/verify-email?token=…`. El token en texto plano nunca se almacena en base de datos.

### 8.3 Middleware de autenticación

El middleware de autenticación debe, además de verificar la firma del JWT, comprobar que el claim `jwtVersion` del token coincide con el campo `jwt_version` del usuario en base de datos. Si los valores difieren, el token ha sido invalidado y debe retornarse HTTP 401. Tras esa validación, debe comprobar `is_active`; si es `FALSE`, retornar HTTP 401. Finalmente, debe comprobar `email_verified`; si es `FALSE`, retornar HTTP 403 con código `EMAIL_NOT_VERIFIED`.

**Códigos de respuesta diferenciados:**
- HTTP 401 — token inválido, expirado, `jwt_version` no coincide o `is_active = FALSE`
- HTTP 403 con código `EMAIL_NOT_VERIFIED` — token válido pero email sin verificar

```typescript
// middleware/auth.ts
const payload = verifyJwt(token); // verifica firma y expiración
const user = await userRepo.findById(payload.sub);
if (!user || user.jwtVersion !== payload.jwtVersion) {
  throw new UnauthorizedException();
}
if (!user.isActive) {
  throw new UnauthorizedException();
}
if (!user.emailVerified) {
  throw new EmailNotVerifiedException(); // HTTP 403
}
```

### 8.4 Flujo de reset-password con invalidación de tokens (SEC-004)

```
POST /auth/reset-password
  { token, newPassword }

  1. Verificar token_hash en BD
  2. Verificar expires_at > NOW()
  3. Verificar used = FALSE
  4. En transacción atómica:
     a. Actualizar password_hash con Argon2
     b. Incrementar jwt_version += 1          ← invalida todos los tokens previos
     c. Marcar token como used = TRUE
  5. Devolver 200 OK
```

### 8.5 Contratos de usuario y autenticación (DLT-003)

#### POST /auth/register

**Entrada:**

```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "postalCode": "string",
  "phone": "string (opcional)",
  "recaptchaToken": "string"
}
```

**Respuesta (201):**

```json
{
  "token": "string (JWT)",
  "user": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "postalCode": "string",
    "reputationScore": 0,
    "totalReceived": 0,
    "totalDonated": 0
  }
}
```

#### POST /auth/login

**Respuesta (200):**

```json
{
  "token": "string (JWT)",
  "user": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "reputationScore": "integer"
  }
}
```

#### GET /users/me

**Respuesta (200):**

```json
{
  "id": "uuid",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "phone": "string | null",
  "postalCode": "string",
  "preferredLanguage": "string",
  "emailVerified": "boolean",
  "reputationScore": "integer",
  "totalReceived": "integer",
  "totalDonated": "integer",
  "consecutiveNoShows": "integer",
  "createdAt": "ISO8601"
}
```

> `is_active`, `cycles_at_limit`, `last_cycle_incremented_at` y `location` no se exponen.

#### GET /users/:id

**Respuesta (200):**

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "reputationScore": "integer",
  "totalReceived": "integer",
  "totalDonated": "integer",
  "createdAt": "ISO8601"
}
```

> `phone`, `email`, `consecutiveNoShows`, `emailVerified` y `preferredLanguage` no se exponen en perfil público.

#### PATCH /users/me

| Parámetro | Detalle |
|---|---|
| Método | PATCH |
| Ruta | `/users/me` |
| Autenticación | Requerida |
| Autorización | El propio usuario autenticado |

**Entrada:**

```json
{
  "firstName": "string (opcional)",
  "lastName": "string (opcional)",
  "avatarUrl": "string | null (opcional)",
  "phone": "string | null (opcional)",
  "postalCode": "string (opcional)",
  "preferredLanguage": "string (opcional)"
}
```

**Respuesta (200):**

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "phone": "string | null",
  "postalCode": "string",
  "preferredLanguage": "string"
}
```

**Errores:** 400 (payload inválido o código postal no geocodificable), 401 (no autenticado).

**Notas:**
- Si `postalCode` se incluye: re-geocodificación LRU → Nominatim → actualización de `location`. Si falla, 400 y ningún campo se actualiza.
- Si `postalCode` se modifica con éxito: `jwt_version += 1` en la misma transacción (invalida tokens previos; el cliente debe redirigir a login).
- `email` y `emailVerified` no son editables por este endpoint.
- `avatarUrl: null` elimina el avatar; borrado físico en Storage vía cola existente.

---

### 8.6 Verificación de email

#### GET /auth/verify-email

**Descripción:** Verificación de email mediante token recibido por enlace. Endpoint público (sin JWT).

```
GET /auth/verify-email?token=<token_raw>

  1. Calcular hash = SHA-256(token_raw)
  2. Buscar usuario por verification_token_hash = hash
     → Si no existe: 400 (token inválido)
  3. Verificar verification_token_expires_at > NOW()
     → Si expirado: 400 (token expirado)
  4. En transacción atómica:
     a. email_verified = TRUE
     b. verification_token_hash = NULL
     c. verification_token_expires_at = NULL
     d. verification_resend_at = NULL
  5. Devolver 200 OK
```

**Respuesta (200):**

```json
{
  "message": "Email verificado correctamente"
}
```

**Errores:** 400 — token inválido o expirado.

#### POST /auth/resend-verification

**Descripción:** Reenvío del email de verificación. Requiere JWT válido.

```
POST /auth/resend-verification
  Authorization: Bearer <token>

  1. Validar JWT (firma + jwt_version)
     → Si inválido: 401
  2. Verificar email_verified === FALSE
     → Si ya verificado: 409
  3. Verificar cooldown: verification_resend_at < NOW() - INTERVAL '30 seconds'
     → Si cooldown activo: 429 con header Retry-After: <segundos restantes>
  4. Generar nuevo token (crypto.randomBytes(32))
  5. En transacción atómica:
     a. verification_token_hash = SHA-256(nuevo_token)
     b. verification_token_expires_at = NOW() + INTERVAL '24 hours'
     c. verification_resend_at = NOW()
  6. Enviar email EVT-014 (TPL-009)
  7. Devolver 200 OK
```

**Respuesta (200):**

```json
{
  "message": "Email de verificación reenviado"
}
```

**Errores:** 401 (JWT inválido), 409 (email ya verificado), 429 (cooldown activo, incluir `Retry-After`).

**Nota:** cada reenvío invalida el token anterior al sobrescribir `verification_token_hash`.

**Rutas exentas de verificación `emailVerified` en middleware:** `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email`, `POST /auth/resend-verification`.

### 8.7 Rutas Públicas y SEO
Las rutas de consulta de objetos permiten el acceso sin autenticación para favorecer la indexación por bots y el descubrimiento por usuarios invitados.

**Endpoints con autenticación opcional:**
- `GET /api/items` (Feed)
- `GET /api/items/:id` (Detalle)

**Manejo de Obsolescencia (SEO):**
Si se solicita un objeto mediante un UUID válido pero el registro no existe en la tabla `items` (debido a purga física tras 30 días en estado final), el servidor debe retornar **HTTP 410 Gone** en lugar de 404. Esto indica a los buscadores que el recurso ha sido eliminado permanentemente y debe ser removido de sus índices.

---

## 9. Geocodificación (Nominatim + LRU Cache)

### 9.1 Configuración

| Parámetro | Valor |
|---|---|
| Proveedor | Nominatim (OpenStreetMap) |
| Endpoint | `https://nominatim.openstreetmap.org/search` |
| Caché | LRU Cache en memoria del backend |
| Capacidad caché | 500 códigos postales |

### 9.2 Implementación (GeocodingService)

```typescript
const geoCache = new LRUCache<string, { lat: number; lon: number }>({
  max: 500
});

async function geocodePostalCode(
  postalCode: string,
  country: string = 'es'
): Promise<{ lat: number; lon: number }> {
  const cacheKey = `${country}:${postalCode}`;

  const cached = geoCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://nominatim.openstreetmap.org/search` +
    `?postalcode=${postalCode}&country=${country}&format=json&limit=1`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Regalalo/1.0' }
  });

  const data = await response.json();

  if (!data.length) {
    throw new GeocodingException(
      `Código postal no encontrado: ${postalCode}`
    );
  }

  const result = {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon)
  };

  geoCache.set(cacheKey, result);
  return result;
}
```

**Nota:** el LRU Cache se vacía en cada reinicio del servidor. Asumible para el volumen esperado en MVP.

---

## 10. Notificaciones por Email (Resend)

Todos los templates activos (TPL-001 a TPL-010) incluyen saludo personalizado con `{{firstName}}` donde aplique. El usuario ya se recupera en cada Use Case que dispara email — no se requiere consulta adicional.

**Presentación visual:** layout HTML compartido (`renderEmailLayout()`), tokens sincronizados con `no-lo-vendo/docs/project/colors_and_type.css`. Spec: `docs/email-template-design.md`. Criterio go-live: ningún TPL en producción sin layout de marca (Épica 9).

**Registro:** un único envío EVT-014 / TPL-009 (bienvenida + verificación). EVT-001 / TPL-001 no se dispara en `RegisterUser`.

| Template | Variable añadida | Uso |
|---|---|---|
| TPL-001 … TPL-008 | `{{firstName}}` | Saludo de apertura |
| TPL-009 | `{{firstName}}`, `{{verificationLink}}`, `{{expiresInHours}}` | Verificación de email (+ bienvenida en registro) |
| TPL-010 | `{{firstName}}`, `items[]`, `appUrl` | Digest horario de objetos nuevos en zona (EVT-015) |

| Evento | Destinatario | Contenido |
|---|---|---|
| Registro completado — verificación pendiente | Usuario recién registrado | Enlace de verificación de email (expira en 24 horas) |
| Reenvío de verificación solicitado | Usuario solicitante | Nuevo enlace de verificación de email (expira en 24 horas) |
| Digest horario de objetos cercanos | Usuario activo verificado en radio 50 km | Resumen de objetos publicados en la última hora |
| Sesión expirada sin confirmación | Donante | El objeto ha vuelto a estado activo |
| Donante cancela objeto | Receptor seleccionado | La entrega ha sido cancelada por el donante |

---

## 11. Rate Limiting y Seguridad HTTP

### 11.1 Rate Limiting

| Instancia | Scope | Límite | Ventana |
|---|---|---|---|
| Global | Todas las rutas excepto `/jobs/*` | 60 peticiones / IP | 60 segundos |
| Auth | `/auth/*` | 10 peticiones / IP | 15 minutos |
| Ranking | `GET /items/:id/requests` | 10 peticiones / IP | 1 minuto |
| Jobs | `/jobs/*` | 5 peticiones / IP | 10 minutos |

> La exclusión de `/jobs/*` del rate limit global evita bloquear invocaciones legítimas desde IPs fijas de cron-job.org.

```typescript
// middlewares/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/jobs'),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// SEC-009: rate limit específico para el endpoint de ranking
// Previene inferencia estadística del score efectivo mediante consultas repetidas
export const rankingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

export const jobsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
```

El `rankingRateLimit` se aplica exclusivamente sobre la ruta `GET /items/:id/requests`. El `jobsRateLimit` sobre `/jobs/*`.

### 11.2 Cabeceras de Seguridad HTTP — Helmet.js (SEC-010)

`helmet` se configura como middleware global antes de cualquier ruta en `main.ts`:

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet({
  hsts: {
    maxAge: 31536000,        // 1 año
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: false, // Gestionado por Angular/Vercel en frontend
}));
```

**Cabeceras activadas por defecto con helmet:**
- `Strict-Transport-Security` (HSTS) — fuerza HTTPS
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (desactivado — comportamiento correcto en navegadores modernos)
- `Referrer-Policy: no-referrer`
- `X-DNS-Prefetch-Control: off`

Adicionalmente, habilitar HTTPS enforcement en la configuración de Railway para el entorno de producción.

---

## 12. Reglas de Autorización por Use Case

**Nota transversal — Verificación de email:**
La verificación `user.emailVerified === TRUE` se ejecuta en el middleware de autenticación, con anterioridad a cualquier use case. Los use cases no implementan esta verificación de forma individual. Los únicos endpoints que no aplican esta verificación son los del flujo de autenticación: `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email` y `POST /auth/resend-verification`.

Esta sección especifica las verificaciones de autorización a nivel de objeto (BOLA) que deben implementarse dentro de cada use case, no en el middleware de ruta. El middleware de autenticación verifica JWT válido, `jwt_version`, `is_active` e `emailVerified`, e inyecta `current_user`. La autorización sobre el recurso concreto es responsabilidad exclusiva del use case.

**Principio general:** ante un fallo de autorización sobre un recurso existente, retornar siempre `ForbiddenException` (HTTP 403) con mensaje genérico. Nunca retornar HTTP 404 como sustituto de 403, ya que confirmaría la existencia del recurso a un atacante.

---

### 12.1 GetItemCandidates (GET /items/:id/requests) — SEC-001

```
Verificación obligatoria:
  item.donor_id === current_user.id
  → Si no se cumple: ForbiddenException

Contexto: el ranking de candidatos es información exclusiva del donante.
Un receptor que conozca el item_id no debe poder acceder a la lista
ni a los scores de reputación de otros solicitantes.
```

---

### 12.2 GetDeliverySession (GET /delivery-sessions/:id) — SEC-002

```
Verificación de participación:
  session.donor_id === current_user.id
  OR session.receiver_id === current_user.id
  → Si no se cumple: ForbiddenException

Visibilidad de contact_channel:
  Incluir en DTO únicamente si se cumplen las tres condiciones simultáneamente:
    1. current_user.id === session.receiver_id
    2. session.status === 'active'
    3. session.contact_purged === FALSE
  En cualquier otro caso: omitir el campo del DTO (valor null).

El donante nunca recibe contact_channel en la respuesta
(fue él quien lo introdujo; no tiene utilidad de consulta).
```

---

### 12.2b GetDeliverySession — `sharedContactChannel` (SEC-002b)

```
Eco read-only del canal que el donante facilitó al seleccionar receptor.

Incluir sharedContactChannel en el DTO únicamente si se cumplen las cuatro condiciones:
  1. current_user.id === session.donor_id
  2. session.status === 'active'
  3. session.contact_purged === FALSE
  4. session.contact_channel tiene valor en BD

En cualquier otro caso: sharedContactChannel = null.

El receptor siempre recibe sharedContactChannel = null
(usar contactChannel para el canal del donante, SEC-002).

Campos embebidos adicionales en GET /delivery-sessions/:id:
  role: 'donor' | 'receiver' respecto al usuario autenticado
  item: { title, condition, images[] } — sin description; images con regla 30 días
  otherParty: { userId, reputationScore, distanceMeters } — sin email, teléfono ni consecutiveNoShows
```

---

### 12.2c GetDeliverySession — `receiverContactChannel` (SEC-002c)

```
Canal del candidato seleccionado, visible al donante.

Incluir receiverContactChannel en el DTO únicamente si se cumplen las tres condiciones:
  1. current_user.id === session.donor_id
  2. session.status === 'active'
  3. session.receiver_contact_purged === FALSE

En cualquier otro caso: receiverContactChannel = null.

El receptor siempre recibe receiverContactChannel = null
(fue él quien lo introdujo; no tiene utilidad de consulta).
```

**Tabla de visibilidad consolidada por campo y rol:**

| Campo | Donante (sesión `active`, no purgado) | Receptor (sesión `active`) |
|---|---|---|
| `contactChannel` | `null` (siempre) | valor (SEC-002) |
| `sharedContactChannel` | valor (SEC-002b) | `null` (siempre) |
| `receiverContactChannel` | valor (SEC-002c) | `null` (siempre) |

---

### 12.3 CancelItem (DELETE /items/:id) — SEC-005

```
Verificación obligatoria:
  item.donor_id === current_user.id
  → Si no se cumple: ForbiddenException

Secuencia en transacción atómica:
  1. Verificar propiedad (ver arriba)
  2. Buscar delivery_session activa asociada al item_id
  3. Si existe sesión activa:
     a. Actualizar session.status = 'cancelled'
     b. Actualizar session.completed_at = NOW()
     c. Encolar notificación por email al session.receiver_id
  4. Actualizar item.status = 'cancelled'

Todo el bloque en una única transacción. Si falla cualquier paso,
revertir completo. La notificación por email se encola dentro de la
transacción pero se envía de forma asíncrona tras el commit.
```

---

### 12.4 RequestItem (POST /items/:id/requests)

```
Input obligatorio (épica 12):
  contactChannel: string (mín. 1 carácter, máx. 500, trim aplicado)
  → Si ausente o vacío: BadRequestException('contactChannel requerido') → HTTP 400

Verificación anti-autosolicit:
  item.donor_id !== current_user.id
  → Si no se cumple: BadRequestException('No puedes solicitar tu propio objeto')

Esta verificación precede a la comprobación del límite de solicitudes.
El UNIQUE constraint de BD (item_id, requester_id) es una barrera de
integridad, no sustituye a esta verificación lógica.

Almacenamiento:
  item_requests.contact_channel = contactChannel (nullable en BD; obligatorio por use case)
```

---

### 12.5 ConfirmDelivery (POST /delivery-sessions/:id/confirm)

```
Verificación obligatoria:
  session.donor_id === current_user.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  session.status === 'active'
  → Si no se cumple: ConflictException

Idempotencia:
  Si donor_confirmed === TRUE: retornar ConflictException
  (previene doble confirmación)

Secuencia en transacción atómica:
  1. donor_confirmed = TRUE
  2. status = 'completed', completed_at = NOW()
  3. Leer total_donated del donante ANTES del UPDATE (RFC-004)
  4. Donante: delta = +15 si total_donated_prev = 0, si no +10;
     reputation_score += delta; consecutive_no_shows = 0; total_donated++
  5. Receptor: reputation_score += 1; consecutive_no_shows = 0; total_received++
  6. Registrar dos filas en reputation_events con role:
       (donor_id, 'delivery_completed', donorDelta, session_id, 'donor')
       (receiver_id, 'delivery_completed', +1, session_id, 'receiver')
```

---

### 12.6 CancelDelivery (POST /delivery-sessions/:id/cancel)

```
Verificación obligatoria:
  session.donor_id === current_user.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  session.status === 'active'
  → Si no se cumple: ConflictException

Secuencia en transacción atómica:
  1. no_show_declared = noShow (del payload)
  2. status = 'cancelled', completed_at = NOW()
  3. Si noShow === true:
     a. consecutive_no_shows++ (receptor)
     b. delta = -10 × consecutive_no_shows (receptor)
     c. reputation_score += delta (receptor)
     d. Registrar evento no_show en reputation_events con role = 'receiver'
  4. item.status = 'active', item.reserved_at = NULL
```

---

### 12.7 SelectReceiver (POST /items/:id/requests/:requestId/select)

```
Verificación obligatoria (doble):
  item.donor_id === current_user.id
  AND request.item_id === item.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  request.status === 'pending'
  item.status === 'active'
  → Si no se cumple: ConflictException

PRE-TRANSACCIÓN (épica 12):
  Leer item_requests.contact_channel de la solicitud seleccionada (FOR UPDATE)
  → Capturado antes de iniciar la transacción para usarlo en el INSERT

Secuencia en transacción atómica:
  1. Crear delivery_session con:
       contact_channel          = contactChannel del payload (donante)
       receiver_contact_channel = contact_channel leído pre-tx de item_requests
  2. item_requests (solicitud seleccionada):
       status          = 'selected'
       contact_channel = NULL  ← purga inmediata tras copia a sesión
  3. item_requests (demás solicitudes del mismo item, status = 'pending'):
       status          = 'rejected'
       contact_channel = NULL  ← purga inmediata para rechazados
  4. item.status = 'reserved', item.reserved_at = NOW()

Garantía: si la transacción falla en cualquier paso, no hay copia parcial.
El contact_channel del candidato permanece en item_requests hasta commit exitoso.
```

---

### 12.8 PauseItem (PATCH /items/:id/pause)

```
Verificación obligatoria:
  item.donor_id === current_user.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  item.status === 'active'
  → Si no se cumple: ConflictException

Secuencia:
  1. items.requests_paused = paused (del payload)
  2. Retornar { requestsPaused: paused }
```

---

### 12.9 Instrumentación analítica (DLT-004)

La instrumentación **no modifica** autorización ni flujos de error. Tras commit exitoso (o en el adaptador post-job), cada use case/job emite el evento correspondiente vía `emitEvent` (log Pino + fila en `analytics_events` cuando persistencia Postgres está activa).

| ID | Evento | Origen |
|---|---|---|
| AE-001 | `user.registered` | RegisterUser |
| AE-002 | `user.login` | LoginUser |
| AE-010 | `item.published` | CreateItem / PublishItem |
| AE-011 | `item.requested` | RequestItem |
| AE-012 | `item.receiver_selected` | SelectReceiver |
| AE-013 | `item.degraded` | DegradeInactiveItemsUseCase (por ítem degradado) |
| AE-014 | `item.cancelled` | CancelItem |
| AE-015 | `item.requests_paused` | PauseItemRequests |
| AE-020 | `session.completed` | ConfirmDelivery |
| AE-021 | `session.expired` | ExpireDeliverySessionsUseCase |
| AE-022 | `session.cancelled_no_show` | CancelDelivery (noShow=true) |
| AE-023 | `session.cancelled_donor` | CancelDelivery (noShow=false) |
| AE-030 | `reputation.changed` | ReputationService |
| AE-031 | `limit.reached` | RequestItem (catch LimitExceededException, antes de relanzar) |

Detalle de `properties` por evento: `docs/delta-backend-DLT-004.md` §D.

---

### 12.12 ListItems (GET /items) — Guest Mode
```
Acceso: Público (autenticación opcional)

Lógica de filtrado:
  Si current_user existe:
    - Aplicar radio de 50km basado en current_user.location
    - Calcular distanceMeters para cada ítem
  Si current_user es NULL:
    - Omitir filtrado por radio (Feed Global)
    - distanceMeters = 0 o NULL en el DTO
```

---

### 12.13 GetItem (GET /items/:id) — Guest Mode
```
Acceso: Público (autenticación opcional)

Lógica de privacidad (si current_user es NULL):
  - donor.id = NULL
  - donor.firstName = "Anónimo"
  - donor.lastName = ""
  - donor.avatarUrl = NULL
  - donor.reputationScore = (valor real de BD)
  - distanceMeters = 0 o NULL
```

---

## 13. Contrato OpenAPI y documentación HTTP

Todas las rutas REST se exponen bajo el prefijo **`/api`** (p. ej. `POST /api/auth/login`).

| Artefacto | Ubicación | Uso |
|---|---|---|
| Especificación OpenAPI 3 | [`openapi/openapi.json`](../openapi/openapi.json) | Contrato versionado; entrada de `ng-openapi-gen` en el frontend |
| Generación desde código | [`src/openapi/`](../src/openapi/) | Esquemas Zod + registro de paths (`@asteasolutions/zod-to-openapi`) |
| Validadores HTTP | [`src/interfaces/validators/`](../src/interfaces/validators/) | Importan `z` desde [`src/zod.ts`](../src/zod.ts) (misma fuente que OpenAPI) |

### Regenerar el contrato (backend)

```bash
npm run openapi:generate   # escribe openapi/openapi.json
npm run build              # incluye openapi:generate vía prebuild implícito en script build
```

### Explorar la API en local (solo `NODE_ENV !== 'production'`)

| URL | Descripción |
|---|---|
| `GET /api/openapi.json` | Spec JSON en vivo |
| `GET /api/docs` | Swagger UI |
| `GET /api-docs` | Redirección a Swagger UI |

### Cliente Angular (frontend)

Tras cambiar rutas o esquemas en el backend:

```bash
cd ../backend && npm run openapi:generate
cd ../no-lo-vendo && npm run api:generate
```

El código generado queda en `no-lo-vendo/src/app/core/api/generated/`. La URL base se configura con `environment.apiUrl` y `provideApiClient()` en `app.config.ts`.
