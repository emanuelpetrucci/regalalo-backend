---
type: epic
title: "Sistema de Reportes (PRD-REP-BE-01) — Correct Course 2026-06-09"
parent: initiative-backend
status: in-progress
covers: [R53, R57, R58, R59, R60, R61, R62]
---

# Sistema de Reportes (PRD-REP-BE-01) — Correct Course 2026-06-09

## Description

Los usuarios autenticados con email verificado pueden reportar objetos o perfiles de usuario. El panel administrativo recibe una cola de moderación FIFO con herramientas de resolución, acciones de cascada y notificaciones automáticas.

**Referencia:** `docs/PRD-REP-BE-01.md`

---

## Outcome

Los usuarios autenticados con email verificado pueden reportar objetos o perfiles de usuario.

## Requirements

1. R53 (parent R53): El sistema debe exponer una cola de reportes al administrador: listar paginado con filtros, ver detalle completo con contexto de moderación, y resolver con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota obligatoria. Implementado en Épica 14 (PRD-REP-BE-01).
2. R57 (parent R57): El sistema debe permitir a usuarios autenticados con email verificado reportar objetos o perfiles de usuario via `POST /api/reports`, con reCAPTCHA V3 (score ≥ 0.5), validación de auto-reporte y entidad reportable.
3. R58 (parent R58): El sistema debe capturar snapshot del contenido reportado (título/estado para items; nombre/reputación para usuarios) en el momento del INSERT, independiente del estado futuro de la entidad.
4. R59 (parent R59): El sistema debe aplicar prevención de duplicados activos (409 si ya existe reporte pendiente del mismo usuario sobre la misma entidad) y límites anti-spam: 3 reportes sobre la misma entidad en 24h (429) y 10 reportes totales en 7 días (429).
5. R60 (parent R60): El sistema debe enviar tres flujos de email al módulo de reportes: confirmación al denunciante (TPL-011), resolución genérica al denunciante (TPL-012) y advertencia al denunciado solo en acción `warn_user` (TPL-013). Notificación al operador en cada nuevo reporte (TPL-ADM-002).
6. R61 (parent R61): El sistema debe anonimizar `reporter_id` mensualmente en reportes cerrados con más de 2 años de antigüedad via job pg_cron (RGPD — D-REP-07).
7. R62 (parent R62): El sistema debe emitir dos eventos analíticos del módulo de reportes: `report.submitted` (AE-032) tras creación exitosa y `report.resolved` (AE-033) tras resolución, ambos fire-and-forget post-commit.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes
