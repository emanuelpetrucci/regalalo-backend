# Sprint Change Proposal — Ranking y reputación v1.0 (RFC-RANK-2026-01 a 04)

**Fecha:** 2026-05-29  
**Solicitante:** Emanuel  
**Estado:** ✅ Aprobado (2026-05-29, Emanuel — batch + yes)  
**Modo de revisión:** Batch  
**Referencias de entrada:**
- `docs/ranking-spec-v1.0.md` (✅ aprobado 29 mayo 2026)
- `docs/ranking-system.md`, `docs/ranking-guia-producto.md` (pendientes de sync §14)
- Implementación actual: épicas 3–4 `done`, código en `delivery-session.repository.ts`, `request.repository.ts`

---

## 1. Resumen del issue

### Problema

Tras completar el MVP de ranking y reputación (épicas 3–4), producto y diseño técnico aprobaron una **revisión sustancial** del equilibrio incentivos/penalizaciones y del control de acaparadores. La spec `ranking-spec-v1.0.md` es la nueva fuente de verdad, pero **PRD, arquitectura, épicas, código y tests** siguen describiendo e implementando las reglas originales (FR18, +10 simétrico, base no-show -20).

### Disparador

Aprobación formal de `ranking-spec-v1.0.md` (RFC-001 a RFC-004 + MIGR-001) — alineación obligatoria antes de marcar PRs como listos para revisión (§14 de la spec).

### Evidencia de desalineación (código actual)

| Área | Comportamiento actual | Comportamiento spec v1.0 |
|------|----------------------|--------------------------|
| `confirmDelivery` | Donante y receptor `+10` | Donante `+10`/`+15`, receptor `+1` |
| `cancelDelivery` no-show | `delta = -20 × n` | `delta = -10 × n` |
| `findRankedCandidates` | Penalización FR18: `cycles≥3 AND ratio 5×` | Tier 1: `cycles≥1 AND total_donated=0` → -15; Tier 2: `cycles≥2 AND total_donated=0` → exclusión |
| `reputation_events` | Sin columna `role` | MIGR-001: `role IN ('donor','receiver')` |
| `emitDeliveryCompletedReputation` | `delta: 10` para ambos | Deltas asimétricos en analytics |
| `GET /users/me/items` → `requestCount` | Solo excluye pasivos (FR17) | Debe excluir también Tier 2 (QA-14) |

---

## 2. Análisis de impacto

### Checklist — resumen de ejecución

| Sección | Resultado |
|---------|-----------|
| **1. Trigger y contexto** | [x] Done — spec aprobada; épicas 3–4 ya entregadas con reglas obsoletas |
| **2. Impacto en épicas** | [x] Done — épicas 3–4 no se reabren; nueva épica 11 de corrección |
| **3. Conflictos en artefactos** | [x] Done — PRD §10–11, architecture §5–6, epics FR18/21/22, docs ranking |
| **4. Camino forward** | [x] Done — Ajuste directo (Opción 1); rollback no viable |
| **5. Componentes propuesta** | [x] Done — ver §4 |
| **6. Revisión final** | [!] Action-needed — pendiente aprobación explícita del usuario |

### Épicas afectadas

| Épica | Estado sprint | Impacto |
|-------|---------------|---------|
| **Épica 3** (ranking) | `done` | FR18 obsoleto; criterios 3.2 y narrativa 3.3 desactualizados — **no revertir**, documentar vía épica 11 |
| **Épica 4** (entrega) | `done` | FR21/FR22 obsoletos; historias 4.3 y 4.4 — corrección en épica 11 |
| **Épica 5** (historial reputación) | `done` | API sin cambio de contrato; eventos con `delta`/`role` nuevos valores |
| **Épica 7** (analytics AE-030) | `done` | Sin cambio de esquema; emitters deben reflejar deltas `{1,10,15,-10n}` |
| **Épica 11 (nueva)** | `backlog` | Implementación + tests + sync documentación |

**Épicas 1–2, 6, 8, 10:** sin cambio de alcance.

### Historias existentes — impacto documental (no borrar historias `done`)

Las historias 3.2, 3.3, 4.3, 4.4 permanecen como registro histórico del MVP. La épica 11 **supersede** sus criterios de aceptación para ranking/reputación.

### Conflictos en artefactos

| Artefacto | Secciones | Acción |
|-----------|-----------|--------|
| `docs/prd.md` | §10, §11, §9 (nota ranking) | ✅ Resuelto — historia 11.5 |
| `docs/architecture.md` | §5.1–5.3, §6.3, §6.5, §12.5–12.6, esquema `reputation_events` | ✅ Resuelto — historia 11.5 |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR18, FR21, FR22; historias 3.2, 3.3, 4.3, 4.4; mapa FR→épica | Reemplazar FR18; actualizar FR21/22; añadir épica 11 |
| `docs/ranking-system.md` | §2, §3.2, §4 | ✅ Resuelto — historia 11.5 |
| `docs/ranking-guia-producto.md` | Tablas reputación, no-show, acaparador | ✅ Resuelto — historia 11.5 |
| `docs/ranking-spec-v1.0.md` | — | **Fuente de verdad** (sin cambios) |
| `ux-design-specification.md` | — | [N/A] — sin copy de algoritmo |
| OpenAPI | Schemas reputation-history si exponen `role` | Evaluar campo opcional `role` en respuesta historial |
| Tests Vitest | `delivery-sessions-*.test.ts`, `items-candidates.test.ts` | Actualizar expectativas |
| Frontend `no-lo-vendo` | `entrega-detalle` copy `+10` | Historia Angular aparte tras 11.2 — ver handoff |

### Impacto técnico

- **Migración:** `ADD COLUMN role` en `reputation_events`
- **Repositorios:** `delivery-session.repository.ts`, `request.repository.ts`, `user.repository.ts` (`requestCount`)
- **SQL compartido:** `ranked-candidate-filters.ts` — añadir constante Tier 2 (`HOGGER_TIER2_EXCLUSION_SQL` o similar)
- **Analytics:** `reputation.service.ts` (application) — deltas correctos por rol
- **Riesgo de datos en prod:** usuarios con reputación calculada bajo reglas viejas; **no recalcular** desde historial (decisión PRD: score en `users` es fuente de verdad; filas históricas `role=NULL`)
- **MVP:** sigue siendo alcanzable; es **refinamiento de reglas de negocio**, no reducción de alcance

### Impacto en analítica (AE-030)

Sin cambio de esquema `analytics_events`. Post-merge: revisar dashboards que filtren `delta = 10` únicamente.

---

## 3. Enfoque recomendado

### Opción seleccionada: **Ajuste directo (Opción 1)**

| Opción | Viabilidad | Notas |
|--------|------------|-------|
| **1. Ajuste directo** | ✅ Viable | Nueva épica 11 + sync docs; sin tocar historias `done` en git |
| **2. Rollback** | ❌ No viable | Revertir épicas 3–4 destruye valor entregado sin beneficio |
| **3. Revisión MVP** | ❌ No viable | El MVP no se reduce; cambian parámetros del núcleo diferencial |

**Esfuerzo estimado:** Medio (3–5 días dev + 0.5 día docs + tests)  
**Riesgo:** Medio — regresiones en ranking SQL y transacciones de entrega; mitigación: matriz QA §12 de la spec  
**Impacto en timeline:** Insertar épica 11 antes de cualquier release que comunique reglas de reputación al usuario

**Rationale:** La spec ya está aprobada y el inventario de archivos es acotado. El patrón de «épica de corrección post-MVP» es coherente con `sprint-change-proposal-2026-05-29-item-digest` (épica 10).

---

## 4. Propuestas de cambio detalladas

### 4.1 PRD — `docs/prd.md`

#### §10 — Sistema de reputación

**OLD:**
```markdown
| Entrega completada | +10 |
| No-show | -20 × consecutive_no_shows |
```

**NEW:**
```markdown
| Entrega completada (donante, donaciones 2+) | +10 |
| Entrega completada (donante, primera donación histórica) | +15 |
| Entrega completada (receptor) | +1 |
| No-show (receptor) | -10 × consecutive_no_shows |
```

**OLD (ejemplo acumulación):**
```
No-show #1 → -20
No-show #2 → -40
Entrega    → +10
```

**NEW:**
```
No-show #1 → -10
No-show #2 → -20
Entrega como receptor → +1
Primera donación como donante → +15 (racha no-shows → 0)
```

**Rationale:** RFC-001, RFC-002, RFC-004.

#### §11 — Usuario acaparador (reemplaza definición FR18)

**OLD:**
```
cycles_at_limit >= 3 AND total_received > 5 × total_donated
Efecto: penalización -15 sobre score efectivo
```

**NEW:**
```
Tier 1 (penalización): cycles_at_limit >= 1 AND total_donated = 0
  → -15 sobre score efectivo; candidato visible

Tier 2 (exclusión): cycles_at_limit >= 2 AND total_donated = 0
  → no aparece en ranking ni en requestCount del donante

Rehabilitación: total_donated >= 1 elimina Tier 1 y Tier 2 de forma inmediata
```

**Rationale:** RFC-003, DD-02, DD-03, DD-04.

---

### 4.2 Épicas — `_bmad-output/initiative-backend/archive-v6/epics.md`

#### FR18 — reemplazo completo

**OLD:**
```
FR18: El ranking debe penalizar -15 puntos ... (cycles_at_limit >= 3 AND total_received > 5 × total_donated).
```

**NEW:**
```
FR18: El ranking debe aplicar control de acaparador en dos niveles sobre usuarios que nunca han donado (total_donated = 0):
  - Tier 1: si cycles_at_limit >= 1 → penalización de -15 sobre score efectivo (candidato visible).
  - Tier 2: si cycles_at_limit >= 2 → exclusión del listado de candidatos y de requestCount.
  - Rehabilitación: al completar al menos una donación (total_donated >= 1), ningún tier aplica.
```

#### FR21 — actualización

**OLD:** `+10 reputación a ambos`  
**NEW:** `+10 o +15 al donante (primera donación +15), +1 al receptor; consecutive_no_shows = 0 ambos; dos eventos reputation_events con role y delta distintos`

#### FR22 — actualización

**OLD:** `delta = -20 × consecutive_no_shows`  
**NEW:** `delta = -10 × consecutive_no_shows`; evento con `role = 'receiver'`

#### Épica 11 (numeración final: tras épica 10 digest)

```markdown
## Épica 11: Alineación ranking y reputación v1.0 (RFC-RANK)

Implementar ranking-spec-v1.0.md en código, tests y documentación.
Supersede criterios obsoletos de épicas 3–4 sin reabrir su estado `done`.
**FRs:** FR18 (nueva definición), FR21, FR22 (actualizados)
```

#### Historias propuestas (épica 11)

| ID | Título | Alcance |
|----|--------|---------|
| 11.1 | Migración `role` en `reputation_events` | MIGR-001 |
| 11.2 | Reputación asimétrica en confirm/cancel | RFC-001, RFC-002, RFC-004 + analytics emit |
| 11.3 | SQL ranking Tier 1/Tier 2 + `requestCount` | RFC-003 + `ranked-candidate-filters.ts` |
| 11.4 | Tests matriz QA §12 | QA-01 … QA-14 |
| 11.5 | Sync documentación §14 | prd, architecture, ranking-system, guía producto |
| 11.6 | (Opcional) OpenAPI `role` en historial reputación | Si producto expone rol en API |

---

### 4.3 Historia 3.2 — criterios de aceptación (superseded por 11.3)

**OLD:**
```
Dado que un candidato cumple cycles_at_limit >= 3 AND total_received > 5 × total_donated
Entonces su score efectivo tiene una penalización de -15 puntos
```

**NEW (añadir; reemplazar criterio anterior):**
```
Dado cycles_at_limit >= 2 AND total_donated = 0
Entonces el candidato NO aparece en candidates[]

Dado cycles_at_limit >= 1 AND total_donated = 0 (y no excluido por FR17 ni Tier 2)
Entonces effective_score incluye -15 sin modificar reputation_score oficial

Dado total_donated >= 1
Entonces no aplica penalización Tier 1 ni exclusión Tier 2
```

---

### 4.4 Historia 4.3 — confirmar entrega (superseded por 11.2)

**OLD:**
```
reputation_score += 10 para donante y receptor
dos eventos delivery_completed delta +10
```

**NEW:**
```
donante: +15 si total_donated_prev = 0, si no +10
receptor: +1
consecutive_no_shows = 0 ambos
dos eventos con role donor/receiver y deltas correspondientes
```

---

### 4.5 Historia 4.4 — no-show (superseded por 11.2)

**OLD:** `delta = -20 × consecutive_no_shows`  
**NEW:** `delta = -10 × consecutive_no_shows`; `role = 'receiver'` en `reputation_events`

---

### 4.6 Arquitectura — `docs/architecture.md` (secciones clave)

Sincronizar con `ranking-spec-v1.0.md` §7–8 y §14:

- Tabla deltas §5.1
- Pseudocódigo `onDeliveryCompleted(donor, receiver)` y `onNoShow` §5.2
- Fórmula consolidada §5.3 / §9 spec
- SQL `findRankedCandidates` §6.3
- Condición acaparador §6.5 → Tier 1 + Tier 2
- Secuencias `ConfirmDelivery` / `CancelDelivery` §12.5–12.6
- DDL `reputation_events` + migración MIGR-001

---

### 4.7 `sprint-status.yaml` (aplicado 2026-05-29)

```yaml
  epic-11: backlog
  11-1-migracion-role-reputation-events: backlog
  11-2-reputacion-asimetrica-confirm-cancel: backlog
  11-3-ranking-tier-acaparador-sql: backlog
  11-4-tests-ranking-reputacion-qa: backlog
  11-5-sincronizar-documentacion-ranking: backlog
  # 11-6-openapi-role-reputation-history: backlog  # opcional
```

---

## 5. Handoff de implementación

### Clasificación de alcance: **Moderado**

Requiere reorganización de backlog (épica 11) y coordinación PO/DEV; no replanificación estratégica del MVP.

### Responsables

| Rol | Responsabilidad |
|-----|-----------------|
| **Developer (backend)** | Historias 11.1–11.4; migración; PR con matriz QA |
| **Tech writer / Dev** | Historia 11.5 — docs §14 |
| **Developer (frontend)** | Tras 11.2: actualizar copy `+10` en `entrega-detalle` si se muestra delta fijo (historia Angular aparte) |
| **PO / Emanuel** | Aprobar propuesta; priorizar épica 11 en sprint |

### Criterios de éxito

1. Todos los casos QA-01 … QA-14 de la spec pasan (automáticos donde sea posible).
2. `docs/prd.md`, `architecture.md`, `ranking-system.md`, `ranking-guia-producto.md` alineados con `ranking-spec-v1.0.md`.
3. `requestCount` en `GET /users/me/items` coincide con visibilidad de candidatos (QA-14).
4. Eventos AE-030 emiten deltas correctos post-confirm/cancel.
5. Ningún PR de ranking/reputación mergeado sin §14 completo.

### Secuencia recomendada

1. **11.1** Migración (desbloquea auditoría `role`)
2. **11.2** Lógica reputación (RFC-001, 002, 004)
3. **11.3** SQL ranking (RFC-003) — depende de filtros compartidos
4. **11.4** Tests en paralelo tras 11.2–11.3
5. **11.5** Docs (puede iniciar en paralelo con borrador desde spec)
6. Regenerar OpenAPI si aplica; `npm run api:generate` en frontend

### Ruta post-aprobación

- **Implementación:** Developer agent — `dev this story` sobre `9-1` … `9-5`
- **No requiere** PM/Architect salvo disputa de DD-01 (ratio 10:1) — ya documentada y aprobada en spec

---

## 6. Decisiones ya cerradas (no reabrir en implementación)

| ID | Decisión |
|----|----------|
| DD-01 | Ratio recuperación receptor 10:1 — intencional |
| DD-02 | Sin ratio `total_received / total_donated` — basta `total_donated >= 1` |
| DD-03 | Tier 2 solo se rehabilita donando, no por tiempo |
| DD-04 | `cycles_at_limit` no se resetea al donar |

---

## 7. Aprobación

**Resultado:** ✅ Aprobado por Emanuel el 2026-05-29.

**Acciones ejecutadas:**
- `sprint-status.yaml` — épica 11 y historias 11.1–11.5 en `backlog`
- `epics.md` — FR18, FR21, FR22 actualizados; épica 11 añadida
- Handoff: Developer agent — comenzar por `11-1-migracion-role-reputation-events`

---

*Generado por workflow Correct Course — backend — 2026-05-29*
