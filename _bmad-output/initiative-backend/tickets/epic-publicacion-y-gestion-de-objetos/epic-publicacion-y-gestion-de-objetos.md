---
type: epic
title: "Publicación y Gestión de Objetos"
parent: initiative-backend
status: done
covers: [R8, R9, R10, R11, R13, R14, R24, R25, R34]
---

# Publicación y Gestión de Objetos

## Description

Los donantes pueden publicar objetos con imágenes, listar objetos disponibles en su zona geográfica, ver el detalle de un objeto, cancelar sus objetos y pausar/reanudar solicitudes. El sistema degrada automáticamente los objetos inactivos y purga imágenes de objetos finalizados.

## Outcome

Los donantes pueden publicar objetos con imágenes, listar objetos disponibles en su zona geográfica, ver el detalle de un objeto, cancelar sus objetos y pausar/reanudar solicitudes.

## Requirements

1. R8 (parent R8): El sistema debe permitir a los usuarios autenticados publicar objetos con título, descripción, condición, categoría (`category`), rango de peso (`weightRange`), ubicación propia (código postal geocodificado) y hasta 5 imágenes.
2. R9 (parent R9): El sistema debe listar objetos activos dentro de un radio de 50 km del usuario autenticado, con paginación (page/limit), ordenando objetos degradados al final.
3. R10 (parent R10): El sistema debe exponer el detalle de un objeto específico (título, descripción, condición, estado, distancia, imágenes, reputación del donante).
4. R11 (parent R11): El sistema debe permitir al donante cancelar su propio objeto. Si existe sesión activa, cancelarla y notificar al receptor por email (EVT-005).
5. R13 (parent R13): El sistema debe impedir solicitudes en objetos con `requests_paused = TRUE`, retornando 409.
6. R14 (parent R14): El donante debe poder activar/desactivar el flag `requests_paused` en su objeto mediante `PATCH /items/:id/pause`.
7. R24 (parent R24): Los objetos sin selección de receptor tras 7 días deben degradarse (campo degraded_at establecido por job pg_cron). Al degradarse, notificar al donante (EVT-012).
8. R25 (parent R25): Las imágenes de objetos en `completed` o `cancelled` deben purgarse a los 30 días del cambio de estado (job pg_cron). El borrado físico en Supabase Storage se gestiona mediante trigger + tabla `storage_deletion_queue` + polling del adaptador.
9. R34 (parent R34): Los repositorios que devuelvan imágenes deben verificar si el objeto cumple `status IN ('completed','cancelled') AND completed_at < NOW() - 30 días`; en ese caso retornar `images: []` aunque el job no haya ejecutado aún.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-publicacion-y-gestion-de-objetos-retrospective.md
