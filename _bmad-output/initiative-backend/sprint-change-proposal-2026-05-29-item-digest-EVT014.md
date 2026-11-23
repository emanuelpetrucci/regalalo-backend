# Sprint Change Proposal — Digest horario de objetos nuevos (reconciliación EVT-014)

**Fecha:** 2026-05-29  
**Solicitante:** Emanuel  
**Estado:** ✅ Aprobado (2026-05-29, Emanuel — batch + yes)  
**Referencias de entrada:**
- `delta-backend-EVT014.md` (copia en `docs/delta-backend-EVT014.md`)
- `docs/delta-email-flow-EVT014.md`
- Spec previa: `_bmad-output/initiative-backend/archive-v6/spec-nearby-items-hourly-digest-email.md` (draft 2026-05-29)

---

## 1. Resumen del issue

### Problema de producto

Los usuarios cercanos no reciben aviso proactivo cuando se publican objetos en su zona; solo descubren novedades entrando al feed. Se requiere un **digest horario por email**: un cron externo invoca el backend cada hora, agrupa objetos `active` publicados en la última hora y envía **un email por destinatario** con todos los objetos a ≤50 km (excluyendo los propios).

### Hallazgo crítico al integrar los deltas

Los documentos adjuntos etiquetan el cambio como **EVT-014 / TPL-009**, pero esos identificadores **ya están asignados e implementados** a verificación de email (Épica 8, `email-flow-mapping.md` v1.3, `RegisterUser` / `ResendVerification`).

| Identificador | Uso actual (producción de docs/código) | Uso en delta adjunto |
|---------------|----------------------------------------|----------------------|
| **EVT-014** | Registro / reenvío verificación email | Cron digest de objetos |
| **TPL-009** | Bienvenida + enlace verificación (`verificationLink`, `expiresInHours`) | Listado de objetos cercanos (`items[]`, `imageUrl`) |

**Conclusión:** los deltas describen la funcionalidad correcta, pero **no pueden aplicarse con EVT-014 / TPL-009**. Deben renumerarse antes de merge a artefactos y código.

### Propuesta de renumeración (obligatoria)

| Concepto | ID propuesto |
|----------|--------------|
| Evento digest | **EVT-015** |
| Plantilla digest | **TPL-010** |
| Ruta HTTP | `POST /api/jobs/nearby-items-digest` (alineado a spec existente y prefijo `/api`) |

---

## 2. Análisis de impacto

### Épicas

| Épica | Impacto |
|-------|---------|
| **Épica 2** (objetos / geo) | Lógica de radio 50 km ya existe; digest reutiliza PostGIS |
| **Épica 8** | Sin cambios — conserva EVT-014 / TPL-009 |
| **Épica 9** (emails marca) | Añadir TPL-010 con `renderEmailLayout()` (mismo patrón 9.x) |
| **Épica 10 (nueva, recomendada)** | «Jobs HTTP y digest de proximidad» — 1–2 historias |

**Épicas 1–7:** sin modificación de alcance completado.

### Historias / backlog

Nueva historia sugerida (clave sprint-status):

`10-1-digest-horario-objetos-cercanos-email` (o integrar en 2.x si se prefiere no crear épica 10)

**Dependencias:** Épica 9.1+ (layout email) recomendada antes o en paralelo con TPL-010.

### Artefactos en conflicto o a actualizar

| Artefacto | Acción |
|-----------|--------|
| `docs/email-flow-mapping.md` | v1.3 → v1.4: fila **EVT-015** + **TPL-010**; **no** sobrescribir EVT-014 |
| `docs/architecture.md` | v1.5 → v1.6: columna `digest_notified_at`, índice parcial, § jobs HTTP, `CRON_SECRET`, rate limit `/jobs/*` |
| `docs/prd.md` | Añadir requisito explícito de digest horario (hoy ausente en § notificaciones) |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR nuevo + NFR14 nota de excepción; épica 10; contador plantillas TPL-001…**010** |
| `spec-nearby-items-hourly-digest-email.md` | Actualizar: adoptar `digest_notified_at` del delta; fijar EVT-015/TPL-010; resolver diferencias (ver §4) |
| OpenAPI | Registrar ruta operacional + security scheme cron |
| `sprint-status.yaml` | Tras aprobación: `epic-10: backlog`, historia en `ready-for-dev` |

### Impacto técnico

- Migración SQL: `ALTER TABLE items ADD COLUMN digest_notified_at TIMESTAMPTZ`
- Índice: `idx_items_digest_pending` (parcial)
- Nuevo use case, controller, rutas `/jobs`, middleware cron
- Variable entorno `CRON_SECRET` (Railway + cron-job.org)
- **Excepción documentada a NFR14:** job disparado por cron **externo** vía HTTP, no `pg_cron` SQL puro — coherente con hosting serverless y spec draft existente

### UX / frontend

Impacto mínimo: enlaces en email `{{appUrl}}/items/{{itemId}}` — la SPA ya debe redirigir a login si no autenticado (nota en delta email-flow).

---

## 3. Enfoque recomendado

**Opción 1 — Ajuste directo** (recomendada)

- Renumerar EVT/TPL en deltas antes de implementar
- Fusionar delta técnico + spec `spec-nearby-items-hourly-digest-email.md`
- Nueva épica 10 (o historia 2.8) sin rollback de trabajo previo

| Criterio | Valoración |
|----------|------------|
| Esfuerzo | **Medio** (~2–3 días dev + tests + ops cron) |
| Riesgo | **Medio** (carga email, consultas geo N×M; mitigar con índice + agrupación) |
| Rollback | No requerido |
| MVP | Sigue alcanzable; amplía engagement, no reduce scope core |

**Opción 2 — Rollback:** N/A  
**Opción 3 — Reducir MVP:** posponer digest; no recomendado si el delta ya está aprobado en producto

---

## 4. Propuestas de cambio detalladas (fusionadas)

### 4.1 Renumeración evento / plantilla (bloqueante)

**OLD (delta adjunto):**
```
EVT-014 → TPL-009 — digest horario objetos cercanos
```

**NEW:**
```
EVT-015 → TPL-010 — digest horario objetos cercanos
```

**Rationale:** Evitar colisión con verificación de email ya desplegada en documentación y código.

---

### 4.2 PRD — `docs/prd.md`

**Sección:** Notificaciones por email definidas (aprox. §12)

**Añadir fila:**

| Evento | Destinatario | Contenido |
|--------|--------------|-----------|
| Digest horario de objetos nuevos en zona | Usuarios activos y verificados a ≤50 km (no donantes) | Resumen de objetos publicados en la última hora |

**Añadir nota MVP:** sin opt-out de digest; preferencias de notificación post-MVP.

---

### 4.3 `email-flow-mapping.md` v1.3 → v1.4

**OLD:** (sin fila digest; EVT-014 = verificación)

**NEW — añadir:**

| ID_Evento | Trigger | Destinatario | Template_Ref |
|-----------|---------|--------------|--------------|
| EVT-015 | Cron externo → `POST /api/jobs/nearby-items-digest` | Usuarios `is_active`, `email_verified`, ubicación en radio 50 km | TPL-010 |

**Variables TPL-010:** `firstName`, `items[]` (`itemId`, `title`, `condition`, `distanceKm`, `imageUrl?`), `appUrl`

**Mantener sin cambios:** fila EVT-014 / TPL-009 verificación.

---

### 4.4 Architecture — adoptar del delta con ajustes

| Tema | Delta | Decisión fusionada |
|------|-------|-------------------|
| `digest_notified_at` | Sí, marcar antes de enviar | **Adoptar** — idempotencia superior al MVP «sin tabla» del spec draft |
| Ruta | `/jobs/item-digest` | **`POST /api/jobs/nearby-items-digest`** |
| Auth header | `X-Cron-Secret` | **`X-Cron-Secret`** (delta) *o* `Authorization: Bearer` (spec) — **elegir uno en implementación; documentar en OpenAPI** |
| Filtro `email_verified` | No mencionado | **Adoptar del spec** — excluir no verificados |
| Rate limit | Excluir `/jobs/*` del global + 5/10 min | **Adoptar** del delta |
| Imágenes en email | Primera imagen Supabase | **Adoptar** del delta (TPL-010 condicional) |

---

### 4.5 Epics — nueva épica 10 (borrador)

**Épica 10: Digest de proximidad y jobs HTTP**

**Historia 10.1:** Migración `digest_notified_at` + índice + repositorio  
**Historia 10.2:** `SendNearbyItemsDigestUseCase` + TPL-010 + endpoint cron + tests + cron-job.org

**FR propuesto:** FR47 — El sistema envía un digest horario por email a usuarios elegibles cuando hay objetos nuevos en su radio (EVT-015 / TPL-010).

---

### 4.6 Diferencias resueltas spec draft ↔ delta

| Punto | Spec draft | Delta | Resolución |
|-------|------------|-------|------------|
| Idempotencia | Opcional / ventana 1h | `digest_notified_at` pre-envío | **Delta** |
| Plantilla | TPL-010 | TPL-009 (erróneo) | **TPL-010** |
| Contenido email | Lista HTML simple | Cards con imagen opcional | **Delta** (más rico) |
| `email_verified` | Requerido | Omitido | **Spec** |
| Orden items | `created_at DESC` | `distanceKm ASC` | **Delta** (mejor UX) |

---

## 5. Handoff de implementación

| Clasificación | **Moderado** |
|---------------|----------------|
| Ejecutor principal | Developer agent (`bmad-dev-story` / `bmad-quick-dev`) |
| Coordinación | Actualizar `epics.md`, `sprint-status.yaml`, fusionar spec |
| Ops | Configurar `CRON_SECRET` en Railway + cron-job.org (`0 * * * *`) |

### Criterios de éxito

1. EVT-015 / TPL-010 documentados; EVT-014 / TPL-009 intactos
2. Migración aplicada; índice parcial creado
3. Endpoint responde 200 con contadores; 401 sin secreto
4. Un usuario con 2 objetos cercanos en la misma hora recibe **un** email
5. Objetos marcados `digest_notified_at` no reenvían en la siguiente hora aunque falle Resend
6. `npm run build` + tests Vitest del job en verde

### Secuencia sugerida

1. Aprobar esta propuesta (renumeración incluida)
2. Actualizar deltas on-disk → versiones corregidas EVT-015 / TPL-010
3. Actualizar PRD, epics, email-flow, architecture
4. Marcar spec `nearby-items-hourly-digest` como lista para dev
5. Implementar épica 10 (o historia única 10.1)

---

## 6. Checklist Correct Course (resumen)

| Sección | Estado |
|---------|--------|
| 1. Trigger y contexto | [x] Done — deltas EVT-014 digest + colisión documentada |
| 2. Impacto épicas | [x] Done — épica 10 propuesta |
| 3. Conflictos artefactos | [x] Done — renumeración obligatoria |
| 4. Camino forward | [x] Done — Opción 1 Direct Adjustment |
| 5. Componentes propuesta | [x] Done |
| 6. Aprobación usuario | [x] Done — Emanuel, 2026-05-29 |
| 6.4 sprint-status.yaml | [x] Done |
| 6.5 Handoff | [x] Developer agent — épica 10, spec `spec-nearby-items-hourly-digest-email.md` |

---

**Aprobado por:** Emanuel — `yes` (2026-05-29, modo batch)
