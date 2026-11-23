# Sprint Change Proposal — DLT-003

**Proyecto:** backend (Regálalo)  
**Fecha:** 2026-05-24  
**Autor del análisis:** Correct Course (BMad)  
**Referencia:** `docs/delta-backend-DLT-003.md`  
**Estado:** Pendiente de aprobación explícita del usuario

---

## 1. Resumen del issue

### Problema / disparador

Se dispone del delta de diseño **DLT-003** (v1.2 → v1.3) que amplía el modelo de usuario con identidad (`first_name`, `last_name`), avatar, teléfono, verificación de email, control `is_active`, idioma preferido, contratos HTTP actualizados y endpoint nuevo `PATCH /users/me`.

### Contexto

- `docs/architecture.md` estaba en **v1.2** sin estos campos.
- Las épicas **1** y **5** están **completadas** (`done`) con contratos anteriores (sin nombre, sin PATCH perfil, sin `is_active` en middleware).
- El código en `src/` y la migración `001-create-users.sql` **no implementan** DLT-003.
- El delta estaba en estado *Pendiente de aprobación* hasta esta ejecución de Correct Course.

### Evidencia

| Artefacto | Estado previo |
|---|---|
| `docs/architecture.md` | Tabla `users` sin 7 columnas DLT-003 |
| `RegisterUserUseCase` | Payload sin `firstName`/`lastName` |
| `sprint-status.yaml` | Sin épica 6 |
| Migraciones | Sin `012-users-dlt-003` |

---

## 2. Análisis de impacto

### Impacto en épicas

| Épica | Impacto |
|---|---|
| 1 (Auth) | Contratos de 1.2, 1.3, 1.4 **superseded** en especificación; implementación requiere realineación (historia 6.2) |
| 5 (Perfil) | Contratos de 5.1, 5.6 **superseded**; implementación requiere realineación (historia 6.3) |
| 6 (nueva) | Cinco historias en backlog para cerrar brecha DLT-003 |
| 2–4 | Sin cambio de schema directo; emails que usan destinatario ganan `firstName` (6.5) |

### Impacto en historias

No se reabren historias `done` en el tracker. Se añade **Épica 6** con historias 6.1–6.5 que documentan el delta de implementación.

### Conflictos de artefactos (resueltos en esta ejecución)

| Artefacto | Acción |
|---|---|
| `docs/architecture.md` | Actualizado a **v1.3** |
| `docs/prd.md` § Usuario | Campos nuevos documentados |
| `docs/email-flow-mapping.md` | `firstName` en variables TPL-001–008 |
| `docs/delta-backend-DLT-003.md` | Marcado como incorporado |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR36–40, Épica 6, historias 6.1–6.5 |
| `sprint-status.yaml` | Entradas épica 6 en `backlog` |

### Impacto técnico

- **Migración SQL** nueva con backfill de `first_name`/`last_name` si hay usuarios en BD.
- **OpenAPI** y cliente Angular (`npm run api:generate` en frontend) tras implementación.
- **Bucket** `avatars/` en Supabase Storage (público).
- **Frontend** (repo `no-lo-vendo`): registro, perfil y PATCH — fuera de scope backend; coordinar en sprint aparte.

---

## 3. Enfoque recomendado

**Opción seleccionada:** Ajuste directo (Opción 1) — Épica 6 en backlog, sin rollback de épicas 1–5.

| Criterio | Valoración |
|---|---|
| Esfuerzo | **Medio** (5 historias, migración + auth + perfiles + emails) |
| Riesgo | **Medio** (migración NOT NULL en entornos con datos; invalidación JWT al cambiar CP) |
| MVP | **Sin reducción de scope** — extensión planificada del modelo usuario |
| Timeline | +1 sprint incremental según capacidad |

**No viable:** Rollback de épicas 1/5 (coste alto, sin beneficio).  
**No viable:** Revisión MVP (no aplica).

---

## 4. Propuestas de cambio detalladas

### 4.1 Architecture (`docs/architecture.md` v1.3)

- §3.1: tabla `users` con 7 columnas y notas de implementación.
- §8.2–8.3: registro con `firstName`/`lastName`; middleware `is_active`.
- §8.5: contratos POST register/login, GET users/me|:id, PATCH users/me.
- §10: `{{firstName}}` en TPL-001–008.

### 4.2 Épicas — Historia 6.4 (ejemplo PATCH)

**Nuevo endpoint** — ver `epics.md` Historia 6.4 y `architecture.md` §8.5.

**Rationale:** Permite edición de perfil sin exponer `email`/`emailVerified`; cambio de CP invalida sesiones por seguridad geográfica.

### 4.3 PRD

Sección Usuario ampliada con campos DLT-003 (sin cambio de reglas de negocio core).

### 4.4 Email mapping

Todas las filas EVT-* incluyen `firstName` en variables requeridas.

---

## 5. Handoff de implementación

### Clasificación de alcance

**Moderado** — Reorganización de backlog (épica 6) + implementación por Developer agent. No requiere replanificación PM/Architect completa (el delta ya estaba especificado).

### Responsables

| Rol | Responsabilidad |
|---|---|
| Developer (backend) | Historias 6.1 → 6.5 en orden; tests; regenerar OpenAPI |
| Developer (frontend) | Tras OpenAPI: registro/perfil/PATCH en `no-lo-vendo` |
| PO (opcional) | Validar que contratos §8.5 cubren UX de diseño |

### Criterios de éxito

1. Migración aplicada; tests de integración auth y users verdes.
2. OpenAPI refleja contratos DLT-003.
3. Emails TPL-* renderizan saludo con `firstName`.
4. `is_active = FALSE` → 401 en todas las rutas protegidas.
5. Frontend regenerado y alineado (fuera de repo backend).

### Orden sugerido

```
6.1 → 6.2 → 6.3 → 6.4 → 6.5
```

---

## 6. Checklist Correct Course (resumen)

| Sección | Estado |
|---|---|
| 1. Trigger y contexto | [x] Done — DLT-003 documentado |
| 2. Impacto épicas | [x] Done — Épica 6 añadida |
| 3. Conflictos artefactos | [x] Done — docs actualizados |
| 4. Path forward | [x] Done — Ajuste directo |
| 5. Componentes propuesta | [x] Done — este documento |
| 6.1–6.2 Revisión | [x] Done |
| 6.3 Aprobación usuario | [!] Action-needed |
| 6.4 sprint-status.yaml | [x] Done |
| 6.5 Handoff | [x] Done |

---

## Aprobación

¿Apruebas esta Sprint Change Proposal para implementación?

- **yes** — Rutear a Developer agent (`bmad-dev-story` / historia 6.1)
- **revise** — Indicar ajustes en épicas o alcance
- **no** — Revertir cambios en artefactos de planificación
