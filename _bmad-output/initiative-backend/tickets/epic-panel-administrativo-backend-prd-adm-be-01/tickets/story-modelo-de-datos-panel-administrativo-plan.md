---
title: "Modelo de datos del panel administrativo"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 13-1: Modelo de datos del panel administrativo

**Descripción:** Como desarrollador, quiero crear las tablas `admin_users`, `admin_otp_tokens` y `admin_audit_log`, añadir el campo `paused_by_admin` a `items` y ampliar el constraint de `reputation_events.type`, para que todas las historias del módulo admin tengan el esquema de base de datos necesario.

**Status:** done

---

## 1. Contexto y Objetivos
Esta es la primera historia de la Épica 13 (Panel Administrativo Backend). El objetivo es establecer la base de datos necesaria para el panel administrativo de "Regálalo".

**Resultados esperados:**
- Esquema de base de datos implementado (tablas admin, campos, constraints).
- Migraciones necesarias creadas y ejecutadas.

---

## 2. Requisitos técnicos

### A. Estructura de base de datos
Debes implementar las siguientes modificaciones en Supabase (PostgreSQL):

1. **Tabla `admin_users`** (ver especificación en `docs/prd-backend-admin.md` §3.1).
2. **Tabla `admin_otp_tokens`** (ver especificación en `docs/prd-backend-admin.md` §3.2).
3. **Tabla `admin_audit_log`** (ver especificación en `docs/prd-backend-admin.md` §3.3).
4. **Modificación `items`** (añadir `paused_by_admin` BOOLEAN, ver `docs/prd-backend-admin.md` §3.4).
5. **Modificación constraint `reputation_events`** (añadir tipo `admin_correction`, ver `docs/prd-backend-admin.md` §3.5).

### B. Migraciones
- Asegúrate de seguir las convenciones de migración del proyecto.
- Las migraciones deben ser idempotentes y seguras para entornos de producción.

---

## 3. Plan de implementación

1. **Crear script de migración:**
   - Escribe el archivo SQL que defina las nuevas tablas y las alteraciones necesarias.
   - Aplica los índices recomendados (ver `docs/architecture.md` / `docs/prd-backend-admin.md`).
2. **Aplicar migración:**
   - Ejecuta la migración en tu entorno local.
3. **Verificación:**
   - Verifica que las tablas y columnas existan con los tipos correctos.
   - Verifica los constraints y defaults.

---

## 4. Guardrails (obligatorio para el Dev Agent)

- **Seguridad:** No expongas nunca contraseñas o OTPs en texto plano. Usa `password_hash` con Argon2.
- **Atomicidad:** Las operaciones de actualización, cuando sea necesario, deben ser atómicas.
- **Convenciones:** Sigue la arquitectura Clean Architecture existente. Las migraciones deben ser explícitas.
- **Validación:** No uses hacks para evadir los tipos de TypeScript.
- **Estructura:** Las nuevas entidades (AdminUser, AdminAuditLog) deben seguir la estructura de módulos propuesta en `docs/prd-backend-admin.md` §9.

---

## 5. Referencias
- `docs/prd-backend-admin.md`: PRD del panel administrativo (fuente primaria).
- `docs/architecture.md`: Arquitectura técnica general del backend.

---

## 6. Checklist de verificación (Developer)
- [x] Tablas `admin_users`, `admin_otp_tokens`, `admin_audit_log` creadas.
- [x] Campo `paused_by_admin` añadido a `items` con default FALSE.
- [x] Constraint `reputation_events_type_check` ampliado.
- [x] Índices creados.
- [x] No hay regresiones en otras áreas del backend.

---

## Dev Agent Record

### Completion Notes
- Migración `020-admin-panel-schema.sql` creada y aplicada exitosamente en entorno dev.
- Las tres tablas admin (`admin_users`, `admin_otp_tokens`, `admin_audit_log`) creadas con `IF NOT EXISTS` para idempotencia.
- Campo `paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE` añadido a `items` con `ADD COLUMN IF NOT EXISTS`.
- Constraint `reputation_events_type_check` ampliado de forma idempotente: primero se elimina si existe (DO $$), luego se recrea incluyendo `admin_correction`.
- Los índices recomendados en el PRD fueron incluidos: `idx_admin_otp_active` (parcial, WHERE used = FALSE), `idx_admin_audit_created`, `idx_admin_audit_entity`.
- 8 tests fallando son pre-existentes (referencian `receiver_contact_channel` de migración 018 y snapshots de emails) — no introducidos por esta historia.

---

## File List
- `src/infrastructure/database/supabase/migrations/020-admin-panel-schema.sql` (nuevo)

---

## Change Log
- 2026-06-08: Creada migración `020-admin-panel-schema.sql` para tablas admin, campo `paused_by_admin` y constraint `admin_correction` en `reputation_events`.
