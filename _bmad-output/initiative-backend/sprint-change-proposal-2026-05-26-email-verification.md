# Sprint Change Proposal — Verificación de email en registro

**Proyecto:** backend (Regálalo)  
**Fecha:** 2026-05-26  
**Autor del análisis:** Correct Course (BMad)  
**Referencias:**  
- `docs/delta-backend-email-verification.md`  
- `docs/delta-email-flow-verification.md`  
**Estado:** Aprobado por Emanuel — 2026-05-26  
**Modo de revisión:** Lote  
**Pre-producción:** sin script de backfill ni retrocompatibilidad requerida

---

## 1. Resumen del issue

### Problema / disparador

Se dispone de dos deltas de diseño (estado *Pendiente de aprobación*) que incorporan **verificación de email obligatoria** en el flujo de registro:

1. **Backend** (`technical-design-backend` v1.2 → v1.3): columnas de token, endpoints `GET /auth/verify-email` y `POST /auth/resend-verification`, bloqueo en middleware (`403 EMAIL_NOT_VERIFIED`).
2. **Email flow** (`email-flow-mapping` v1.1 → v1.2): evento **EVT-014** y plantilla **TPL-009**.

### Contexto de descubrimiento

| Hecho | Detalle |
|---|---|
| Épicas 1–7 | Todas en estado **`done`** en `sprint-status.yaml` |
| Columna `email_verified` | Existe desde DLT-003 (épica 6) con default `FALSE` |
| Lógica de verificación | **No implementada** — PRD y architecture la describen como *gestión externa* |
| Historia 6.2 | Excluye explícitamente la lógica de verificación |
| Código actual | Sin `verification_token_*`, sin endpoints verify/resend, middleware no comprueba `emailVerified` |
| Tests | Mocks con `emailVerified: false` en rutas protegidas — pasan hoy, fallarán al activar middleware |

### Evidencia

- Deltas adjuntos por el usuario en esta sesión de Correct Course.
- `grep` en `src/`: cero coincidencias para `verify-email`, `resend-verification`, `verification_token`.
- `docs/architecture.md` §3.1 y §8.2: `email_verified` gestionado por *artefacto externo*.
- `docs/email-flow-mapping.md` v1.1: solo EVT-001…013, TPL-001…008.

### Inconsistencias entre deltas (acción requerida antes de implementar)

| Tema | Delta email-flow | Delta backend | Resolución propuesta |
|---|---|---|---|
| Enlace en email | `https://<dominio>/verificar-email?token=…` (ruta SPA) | `GET /auth/verify-email?token=…` (API) | Enlace del email → **frontend** `/verificar-email`; la página llama al API. Documentar en architecture §8.5. |
| Emails en registro | TPL-001 **y** TPL-009 | Solo paso 9 EVT-014 en §8.2 | Mantener **ambos** (bienvenida + verificación), alineado con email-flow delta. |
| Dominio del enlace | Placeholder `<dominio>` | No especificado | Usar variable de entorno `APP_PUBLIC_URL` (ya usada en reset password). |

---

## 2. Análisis de impacto

### 2.1 Épicas afectadas

| Épica | Estado | Impacto |
|---|---|---|
| **1** (Auth) | done | Especificación de 1.2, 1.3, 1.4 **superseded** en contrato (registro, middleware, rutas exentas) |
| **6** (DLT-003) | done | Historia 6.2 asumía `email_verified` sin flujo interno — requiere extensión, no reapertura del tracker |
| **2–5, 7** | done | Todas las rutas autenticadas quedarán bloqueadas para usuarios con `email_verified = FALSE` |
| **8** (nueva) | — | Épica dedicada a cerrar la brecha (patrón DLT-003 / épica 6) |

La épica 1 **sigue siendo completable conceptualmente**; la implementación actual está incompleta respecto al nuevo diseño, pero no invalida el trabajo hecho (JWT, reCAPTCHA, reset password).

### 2.2 Historias — propuesta Épica 8

| ID | Título | Alcance |
|---|---|---|
| **8.1** | Migración SQL y entidad User | `verification_token_hash`, `verification_token_expires_at`, `verification_resend_at`; índice parcial |
| **8.2** | Registro con token y email EVT-014 | Extender `RegisterUserUseCase`: generar token, hash SHA-256, enviar TPL-009 (+ mantener TPL-001) |
| **8.3** | Middleware `emailVerified` | Tras `jwt_version` e `is_active`: `403` con código `EMAIL_NOT_VERIFIED`; lista blanca de rutas auth |
| **8.4** | `GET /auth/verify-email` | Use case público, invalidación atómica de token |
| **8.5** | `POST /auth/resend-verification` | JWT requerido, cooldown 30s, `Retry-After`, invalidación token anterior |
| **8.6** | Plantilla TPL-009 y email-flow v1.2 | Resend template, EVT-014 en mapping, OpenAPI, tests de integración auth |

**Frontend** (repo `no-lo-vendo`, fuera de tracker backend): pantalla `/verificar-email`, interceptor HTTP 403 → reenvío, CTA en perfil cuando `emailVerified === false`. Sin delta frontend adjunto — crear `docs/delta-frontend-email-verification.md` en coordinación.

### 2.3 Conflictos de artefactos

| Artefacto | Sección | Cambio necesario |
|---|---|---|
| `docs/prd.md` | § Usuario `email_verified` | De *gestión externa* → verificación interna con enlace 24h |
| `docs/architecture.md` | §3.1, §4, §8.2–8.3, §10, §12 | Incorporar delta backend v1.3 |
| `docs/email-flow-mapping.md` | §1–3, §5 | Incorporar delta email-flow v1.2 |
| `docs/delta-*.md` | — | Marcar como *incorporado* tras merge |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR nuevos, Épica 8, mapa cobertura | Añadir FR38–40 (propuesta), historias 8.1–8.6 |
| `sprint-status.yaml` | — | Entradas `epic-8` y stories en `backlog` |
| `openapi/openapi.json` | Auth paths | Nuevos endpoints + error `EMAIL_NOT_VERIFIED` |
| Tests `tests/**/*.ts` | Fixtures | Usuarios de prueba con `emailVerified: true` o rutas exentas |

### 2.4 Impacto técnico y operativo

- **Breaking change funcional:** usuarios con `email_verified = FALSE` quedarán bloqueados en rutas protegidas hasta verificar. **Mitigación:** el sistema aún no está en producción; no se requiere backfill ni retrocompatibilidad.
- **Seguridad:** token solo en hash; un solo token válido (último reenvío gana).
- **Rate limiting:** reenvío con cooldown 30s; considerar si `/auth/resend-verification` cuenta en límite `/auth/*` (10/15min).
- **Analítica (épica 7):** valorar eventos `user.email_verified` / `user.verification_resent` — fuera de MVP del delta, anotar como follow-up.
- **Despliegue:** orden recomendado — (1) migración SQL, (2) deploy backend con middleware, (3) deploy frontend con ruta `/verificar-email`.

### 2.5 UX

| Área | Impacto |
|---|---|
| Registro | Usuario recibe JWT pero no puede publicar/solicitar hasta verificar |
| Login | Sigue emitiendo JWT; middleware bloquea en primera acción protegida |
| Perfil | Ya muestra `emailVerified` (DLT-003 frontend) — añadir acción *Reenviar verificación* |
| Recuperación contraseña | Sin cambio (rutas exentas) |

---

## 3. Enfoque recomendado

**Opción seleccionada:** **Ajuste directo (Opción 1)** — Nueva Épica 8, sin rollback de épicas 1–7.

| Criterio | Valoración |
|---|---|
| Esfuerzo | **Medio-alto** (6 historias backend + coordinación frontend) |
| Riesgo | **Medio-alto** (breaking en usuarios existentes; enlace email cross-stack) |
| MVP | **Sin reducción de scope** — refuerzo de seguridad/calidad de cuentas |
| Timeline | +1 sprint backend; frontend en paralelo o inmediatamente después |

**No viable — Rollback (Opción 2):** Revertir épica 1 o 6 no simplifica el problema; el campo `email_verified` ya está en BD.

**No viable — Revisión MVP (Opción 3):** La verificación es requisito de producto, no un bloqueo accidental.

---

## 4. Propuestas de cambio detalladas

### 4.1 PRD — `docs/prd.md`

**Sección:** §6 Usuario — fila `email_verified`

**OLD:**
> Verificación de email (gestión externa; expuesto en perfil privado)

**NEW:**
> Verificación de email obligatoria tras registro. El sistema envía un enlace con token de un solo uso (válido 24 h). Hasta verificar, las rutas autenticadas devuelven `403 EMAIL_NOT_VERIFIED`. Reenvío con cooldown de 30 s. Expuesto en perfil privado como solo lectura.

**Rationale:** Alinea PRD con deltas y elimina la ambigüedad de *gestión externa*.

---

### 4.2 Architecture — merge `delta-backend-email-verification.md`

Aplicar íntegramente en `docs/architecture.md` (versión → **1.4**):

- §3.1: tres columnas nuevas + invariantes de token
- §4: índice `idx_users_verification_token`
- §8.1: parámetros expiración 24h y cooldown 30s
- §8.2: flujo registro ampliado (pasos 6–9 + mantener email bienvenida)
- §8.3: tercera comprobación `emailVerified` → 403
- §8.5 (nuevo): contratos `GET /auth/verify-email`, `POST /auth/resend-verification`
- §10: filas de notificación verificación
- §12: nota transversal middleware

**Añadir explícitamente:** `verificationLink` en TPL-009 usa `{APP_PUBLIC_URL}/verificar-email?token={token}`.

---

### 4.3 Email flow — merge `delta-email-flow-verification.md`

Aplicar en `docs/email-flow-mapping.md` (versión → **1.2**):

- EVT-014, TPL-009, variables, diagrama use cases, nota de diseño token/cooldown.

---

### 4.4 Epics — Historia 8.3 (ejemplo middleware)

**Historia:** 8.3 — Middleware con verificación de email

**Criterios de aceptación (nuevos):**

**Dado** JWT válido, `jwt_version` coincidente, `is_active = TRUE` y `email_verified = FALSE`  
**Cuando** accedo a `POST /items` (u otra ruta protegida no exenta)  
**Entonces** responde `403` con cuerpo que incluye código `EMAIL_NOT_VERIFIED`

**Dado** el mismo usuario  
**Cuando** accedo a `POST /auth/resend-verification`  
**Entonces** la petición **no** es bloqueada por verificación de email

**Rationale:** La verificación es transversal en middleware; los use cases de negocio no la repiten (§12 delta).

---

### 4.5 Epics — Historia 1.2 / 1.4 (nota superseded)

No reabrir `1-2-registro-de-usuario` ni `1-4-middleware` en `sprint-status.yaml`. Documentar en `epics.md`:

> Las historias 1.2 y 1.4 quedan superseded en especificación por las historias 8.2 y 8.3. La implementación original permanece `done`; la brecha se cierra en épica 8.

---

## 5. Handoff de implementación

### Clasificación de alcance

**Moderado** — Nueva épica en backlog + implementación Developer agent + coordinación frontend. No requiere replanificación PM completa (deltas ya especifican el diseño).

### Responsables

| Rol | Responsabilidad |
|---|---|
| **Usuario / PO** | Aprobar esta propuesta (hecho 2026-05-26) |
| **Developer (backend)** | Épica 8.1–8.6, merge docs, OpenAPI, tests |
| **Developer (frontend)** | Ruta verificación, interceptor 403, i18n, `api:generate` |
| **Architect** | Revisión opcional de enlace email y orden de despliegue |

### Criterios de éxito

- [ ] Usuario nuevo recibe email con enlace válido 24h
- [ ] `GET /auth/verify-email` marca `email_verified = TRUE` y limpia tokens
- [ ] Rutas protegidas devuelven `403 EMAIL_NOT_VERIFIED` si no verificado
- [ ] `POST /auth/resend-verification` respeta cooldown y emite nuevo token
- [ ] Usuarios nuevos quedan bloqueados en rutas protegidas hasta verificar (comportamiento esperado pre-producción)
- [ ] Frontend redirige correctamente ante 403
- [ ] Deltas marcados incorporados; `sprint-status.yaml` actualizado

### Secuencia sugerida

1. Aprobar propuesta  
2. Merge deltas → `architecture.md`, `email-flow-mapping.md`, `prd.md`  
3. Actualizar `epics.md` + `sprint-status.yaml`  
4. `create-story` / `dev-story` para 8.1 → 8.6  
5. Delta frontend + implementación Angular  
6. Despliegue coordinado backend + frontend

---

## 6. Checklist de navegación (resumen)

| Sección | Estado |
|---|---|
| 1 — Trigger y contexto | [x] Done |
| 2 — Impacto en épicas | [x] Done |
| 3 — Conflictos artefactos | [x] Done |
| 4 — Camino forward (Opción 1) | [x] Done |
| 5 — Componentes propuesta | [x] Done |
| 6.3 — Aprobación usuario | [x] Done — Emanuel, 2026-05-26 |
| 6.4 — Actualizar sprint-status | [x] Done |
| 6.5 — Handoff | [x] Done |

---

## Apéndice — Entradas propuestas para `sprint-status.yaml`

```yaml
  # ─── Épica 8: Verificación de email ───
  epic-8: backlog
  8-1-migracion-sql-verificacion-email: backlog
  8-2-registro-token-y-email-tpl-009: backlog
  8-3-middleware-email-verified: backlog
  8-4-get-auth-verify-email: backlog
  8-5-post-auth-resend-verification: backlog
  8-6-plantilla-tpl-009-y-email-flow: backlog
  epic-8-retrospective: optional
```
