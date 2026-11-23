# Retrospectiva — Épica 7: Analítica e Instrumentación (DLT-004)

**Proyecto:** backend (Regálalo)  
**Fecha:** 2026-05-25  
**Facilitador:** Amelia (Developer)  
**Project Lead:** Emanuel  
**Épica:** 7 — Analítica e Instrumentación (DLT-004)  
**Referencia delta:** `sprint-change-proposal-2026-05-24-DLT-004.md`, `docs/delta-backend-DLT-004.md`, `docs/prd-analytics.md`

---

## Resumen ejecutivo

La épica 7 cerró el delta DLT-004 sin reabrir historias `done` de épicas 1–5: migración y dominio de `items`, loggers separados, contrato breaking de publicación, y catálogo de 15 eventos analíticos (AE-001…AE-031) instrumentados en auth, objetos, solicitudes, entrega, reputación y jobs.

| Métrica | Valor |
|--------|-------|
| Historias totales | 6 |
| Historias completadas | 6 (100 %) |
| Estado sprint (pre-retro) | 7-1…7-6 `done`; `epic-7` `in-progress`; `epic-7-retrospective` `optional` |
| Blockers al cierre | Ninguno |
| Tests (última verificación 7-6) | 266/266 OK, build OK |

**Participantes (party mode):** Amelia (Developer), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev), Emanuel (Project Lead).

---

## Parte 1 — Revisión de la épica

### Objetivos y entregables

| Historia | Entregable clave | Estado |
|----------|------------------|--------|
| 7-1 | Migración `013-items-dlt-004.sql`, entidad `Item` con `category` / `weightRange` | ✅ |
| 7-2 | `config/loggers.ts`, `analytics.service` (`emitEvent`, SHA-256 userId) | ✅ |
| 7-3 | `POST` publicar ítem breaking + AE-010 + OpenAPI | ✅ |
| 7-4 | AE-001 `user.registered`, AE-002 `user.login` | ✅ |
| 7-5 | AE-011…015, AE-031, AE-013 (job degradación) | ✅ |
| 7-6 | AE-020…023, AE-021 (job expiración), AE-030 (`ReputationService`) | ✅ |

### Éxitos y fortalezas

- **Patrón transversal coherente:** Tras 7.2, todas las historias de instrumentación siguieron emisión **post-commit** y **fire-and-forget**, alineado a architecture v1.4 §7.4 y PRD analítica.
- **Deuda 1-1 cerrada:** Unificación de `appLogger` en `pinoHttp` y `main.ts` eliminó la doble instancia pino documentada en `deferred-work.md`.
- **Delta sin reabrir tracker:** Épica 7 como contenedor (igual que épica 6 / DLT-003) permitió breaking change en publicación y telemetría sin tocar filas `done` en `sprint-status.yaml`.
- **Calidad en CR:** Segunda pasada de 7-6 aprobó tras parches HIGH (`safeEmitEvent` en `ReputationService`), MEDIUM (`computeTimeToSelectMs` / guardias de duración) y LOW (imports, test batch AE-021).
- **Privacidad:** `userId` hasheado; properties sin PII; tests con aserciones estrictas en registro (p. ej. igualdad estricta de `postalCode` en AE-001).

### Desafíos y áreas de mejora

- **Curva de aprendizaje en instrumentación:** Las primeras historias (7-3, 7-4) usaron `emitEvent` directo; 7-5 y 7-6 consolidaron `safeEmitEvent` y helpers tras hallazgos CR — el patrón debería ser **default desde 7.2** en specs futuras.
- **Complejidad en select-receiver:** Query extra para `candidateCount`, race aceptada en spec, y DI ampliada en `SelectReceiverUseCase` — coste analítico explícito pero frágil para mantenimiento.
- **Deuda analítica acumulada:** `emitEvent` sin try/catch interno (deferred 7-2/7-3/7-4), mocks `safeEmitEvent` duplicados en tests (deferred 7-6), enums SQL/TS duplicados (deferred 7-1).
- **Handoff frontend pendiente:** OpenAPI actualizado en backend; formulario de publicación con `category` / `weightRange` sigue fuera de este repo (bloqueante E2E según propuesta DLT-004).

### Análisis profundo por historias (temas CR)

| Tema | Historias | Frecuencia |
|------|-----------|------------|
| Post-commit / no await analytics | 7-3…7-6 | Todas instrumentación |
| Validación payload antes de emitir | 7-5 CR | Parches aplicados |
| Tests payload / ISO8601 / no-PII | 7-4, 7-5, 7-6 | Mejora progresiva |
| Jobs + email + analytics en paralelo | 7-5, 7-6 | Patrón establecido |

### Continuidad — Retrospectiva épica 6

- `epic-6-retrospective` está marcada `done` en `sprint-status.yaml`.
- **No se encontró** archivo `epic-6-retro-*.md` en `_bmad-output/implementation-artifacts/` — no fue posible auditar action items comprometidos en épica 6.
- **Lección aplicada desde 6→7:** Mismo patrón de épica delta (DLT-003 → DLT-004), historias acotadas, CR adversarial por historia.
- **Recomendación:** Guardar siempre el markdown de retro (como este documento) además del flag en yaml.

---

## Lecciones aprendidas (síntesis CR)

### Top 3 — obligatorias para el equipo

1. **`safeEmitEvent` sobre `emitEvent` en use cases**  
   Tras commit exitoso, un fallo síncrono del logger no debe convertir un 200/201 en 500. El wrapper en `analytics.service.ts` captura errores y retorna sin afectar negocio. CR 7-6 (HIGH) lo demostró en `ReputationService`; 7-5 generalizó el patrón. **Regla:** use cases y servicios de dominio que emiten AE → `safeEmitEvent` siempre.

2. **`computeTimeToSelectMs` (y guardias de duración)**  
   Métricas `durationMs` / `timeToSelectMs` deben tolerar fechas inválidas o deltas negativos (retorno `0`, finito). Evita payloads analíticos corruptos y cumple SC-02. Reutilizar helpers exportados desde `analytics.service.ts`, no duplicar `Date.now() - createdAt` sin validación.

3. **Fire-and-forget estrictamente post-commit**  
   Nunca `emitEvent` / `safeEmitEvent` dentro de transacciones de repositorio; nunca `await` analítica en la ruta HTTP crítica; jobs emiten por ítem/sesión en el mismo batch que emails EVT, sin que analítica bloquee email ni viceversa. La operación de negocio es la fuente de verdad; el stream `analytics` es observabilidad best-effort.

### Lecciones adicionales

- Centralizar constantes (`REQUEST_LIMIT_WINDOW_MS`) y builders (`buildLimitReachedProperties`) evita magic numbers en AE-031.
- OpenAPI + `npm run api:generate` en frontend es paso de cierre de épica, no opcional.
- Enum `category` / `weightRange`: mantener alineados SQL CHECK, TS union y Zod en un solo cambio.

---

## Parte 2 — Preparación siguiente trabajo

### ¿Existe épica 8 en `epics.md`?

**No.** La lista de épicas del plan backend BMad termina en **Épica 7**. No hay épica 8 definida.

**Estado:** **FIN del plan de épicas backend BMad** (épicas 1–7 completas tras esta retro).

### Handoff y acciones (post-backend)

| # | Acción | Owner sugerido | Prioridad |
|---|--------|----------------|-----------|
| H1 | Frontend: selectores `category` y `weightRange` en publicación; `npm run api:generate` con OpenAPI actualizado | Equipo frontend / Emanuel | Crítica |
| H2 | Verificar E2E publicación con backend desplegado y migración `013` aplicada | QA / Dev | Alta |
| H3 | Revisar `deferred-work.md` épica 7: opcional `try/catch` en `emitEvent` base; helper test compartido `safeEmitEvent` | Backend | Media |
| H4 | Documentar runbook streams `app` vs `analytics` para operaciones (filtros pino, agregación futura) | Ops / Tech writer | Media |
| H5 | Producto: validar cobertura SC-01 (15 eventos con emisión verificada en PR) en release notes | Alice / PO | Media |
| H6 | Arquitectura: ítems pendientes pre-analítica (graceful shutdown, rate-limit Redis, purge contact_channel expirados) siguen en deferred-work global | Backlog técnico | Baja–media |

### Preparación técnica (checklist cierre MVP backend)

- [x] Migración DLT-004 aplicable (`013-items-dlt-004.sql`)
- [x] Catálogo AE instrumentado en código
- [x] Loggers separados (`app` / `analytics`)
- [ ] Coordinación contrato OpenAPI ↔ cliente Angular
- [ ] Smoke de publicación con campos obligatorios en entorno integrado

### Riesgos carry-forward

- Clientes antiguos de `POST` publicar ítem sin `category`/`weightRange` → 400 (breaking esperado).
- Analítica con `hadActiveSession: false` si falla consulta de sesión activa (trade-off documentado en deferred-work 7-5).
- Sin épica backend planificada: nuevos deltas (DLT-005+) requerirán Correct Course + nueva épica o proyecto aparte.

---

## Action items de la retrospectiva

| ID | Acción | Owner | Criterio de hecho |
|----|--------|-------|-------------------|
| AI-7-1 | Actualizar plantilla create-story/dev-story: default `safeEmitEvent` + helpers en tareas de instrumentación | Amelia / BMad customize | Specs nuevas mencionan wrapper explícitamente |
| AI-7-2 | Abrir tarea frontend publicación (H1) y enlazar `docs/api-client.md` | Emanuel | PR frontend con campos obligatorios |
| AI-7-3 | Archivar o ejecutar ítems deferred epic-7 de mayor valor (mock helper tests, try/catch en `emitEvent`) | Charlie | Entrada resuelta o priorizada en deferred-work |
| AI-7-4 | Recuperar/documentar retro épica 6 si existía solo en yaml | Emanuel | `epic-6-retro-*.md` creado o N/A documentado |

---

## Evaluación de preparación (cierre épica 7)

| Área | Estado | Notas |
|------|--------|-------|
| Testing & calidad | ✅ | 266 tests, CR 7-6 aprobado en 2.ª pasada |
| Contrato API | ✅ backend / ⏳ frontend | OpenAPI en repo backend listo para generate |
| Deuda técnica | ⚠️ Aceptada | Ver `deferred-work.md` secciones 7-x |
| Blockers | ✅ Ninguno | — |
| Plan backend BMad | ✅ FIN | Sin épica 8 |

**Veredicto:** Épica 7 **lista para marcarse `done`** en sprint-status. El trabajo restante es **handoff cross-repo y operación**, no historias 7.x pendientes.

---

## Compromisos y próximos pasos

1. Marcar `epic-7-retrospective: done` y `epic-7: done` en `sprint-status.yaml`.
2. Ejecutar handoff H1–H2 antes de declarar MVP publicación cerrado end-to-end.
3. Revisar action items AI-7-1…AI-7-4 en próxima sesión de coordinación (sin estimaciones de calendario).
4. Para nuevo alcance backend: Correct Course → propuesta → épica nueva (no asumir épica 8 automática).

---

## Cierre (party mode)

**Amelia (Developer):** "Seis historias, quince eventos, un breaking contract bien acotado — y aprendimos en CR que la analítica nunca puede tumbar un commit exitoso."

**Alice (Product Owner):** "El MVP backend BMad está completo en roadmap; ahora el producto vive en frontend y en cómo leemos esos logs."

**Charlie (Senior Dev):** "`safeEmitEvent`, `computeTimeToSelectMs`, post-commit — los tres van al project-context."

**Emanuel (Project Lead):** Épica 7 confirmada para cierre; handoff frontend y deferred-work como cola post-épica.

---

*Generado por workflow bmad-retrospective — 2026-05-25*
