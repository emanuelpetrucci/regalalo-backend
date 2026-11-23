---
type: epic
title: "Panel Administrativo Backend (PRD-ADM-BE-01)"
parent: initiative-backend
status: in-progress
covers: [R49, R50, R51, R52, R53, R54, R55, R56]
---

# Panel Administrativo Backend (PRD-ADM-BE-01)

## Description

Autenticación independiente para administradores y módulos de gestión operativa del ecosistema. Todas las rutas bajo `/api/admin/*` requieren `requireAdminAuth`. Todas las acciones que modifican entidades registran entrada en `admin_audit_log`.

**Referencia:** `docs/prd-backend-admin.md`

---

## Outcome

Autenticación independiente para administradores y módulos de gestión operativa del ecosistema.

## Requirements

1. R49 (parent R49): El sistema debe autenticar administradores con tabla `admin_users` independiente, password Argon2 + OTP de 6 dígitos por email (Resend), y emitir JWT de 8 horas firmado con `ADMIN_JWT_SECRET` separado del JWT de usuarios. No existe endpoint de registro; la cuenta se crea manualmente.
2. R50 (parent R50): El sistema debe permitir al administrador autenticado gestionar usuarios: buscar con filtros, ver perfil completo, suspender (cascada: jwt_version++, objetos activos pausados con paused_by_admin), reactivar (solo revierte pausas de origen admin), forzar verificación de email, corregir reputación con delta y razón, y resetear contador de no-shows.
3. R51 (parent R51): El sistema debe permitir al administrador gestionar objetos: buscar con filtros, ver detalle con solicitudes y sesión activa, cancelar objetos activos/reservados (reutilizando lógica de CancelItem), y reactivar objetos cancelados.
4. R52 (parent R52): El sistema debe permitir al administrador gestionar sesiones de entrega: listar con filtros, ver detalle con registro de acceso a contactChannel en audit log, y forzar expiración de sesiones activas.
5. R53 (parent R53): El sistema debe exponer una cola de reportes al administrador: listar paginado con filtros, ver detalle completo con contexto de moderación, y resolver con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota obligatoria. Implementado en Épica 14 (PRD-REP-BE-01).
6. R54 (parent R54): El sistema debe exponer métricas operativas al administrador: totales de usuarios (activos, suspendidos, no verificados >24h, pasivos, acaparadores), objetos por estado, sesiones (últimos 30 días), tasa de no-shows y contadores de reportes (pending, resolvedLast30Days, archivedLast30Days).
7. R55 (parent R55): El sistema debe exponer el estado del sistema al administrador: últimas ejecuciones de jobs pg_cron, cola de borrado de Storage pendiente y usuarios sin verificar >24h.
8. R56 (parent R56): Toda acción del administrador debe registrarse en `admin_audit_log` con admin_user_id, action, entity_type, entity_id, payload_snapshot e ip_address. Retención indefinida en MVP.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes
