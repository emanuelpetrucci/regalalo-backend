# Sprint Change Proposal — Canal de contacto del candidato en la postulación

**Proyecto:** Regálalo / Regálalo  
**Fecha:** 2026-05-31  
**Autor del análisis:** Correct Course (BMad)  
**Solicitante:** Emanuel  
**Documento disparador:** `docs/delta-candidato-contacto.md` v1.0 (product-approved)  
**Decisiones de producto:** 1A · 2B · 3C · 4A · 5A

**Revisión 2026-05-31 (Emanuel):** Épica 12 acotada a **backend + documentación** (3 historias). Sin 12-7 (frontend), sin 12-8 (TPL-006). §7 delta queda **fuera de alcance**.

---

## 1. Resumen del issue

### Problema

Tras la selección del receptor, el donante aporta su canal de contacto pero depende de que el receptor reaccione al email (EVT-003). Si el receptor no lo ve, el flujo se congela sin mecanismo de recuperación: asimetría de comunicación.

### Solución acordada

El candidato aporta `contactChannel` al postularse (`POST /items/:id/requests`). Al seleccionar receptor, el valor se copia a `delivery_sessions.receiver_contact_channel` y se purga de `item_requests` en la misma transacción. El donante ve `receiverContactChannel` en sesión activa (SEC-002c), simétrico al patrón donante→receptor existente.

### Contexto de descubrimiento

- No es un bug de implementación: es **nuevo requisito de producto** validado en delta técnico.
- Épicas 3 y 4 están **done** en `sprint-status.yaml`; el cambio es **brownfield** sobre código en producción.
- El delta incluye checklist de validación técnica pendiente (§8).

### Evidencia

| Fuente | Contenido |
|--------|-----------|
| `docs/delta-candidato-contacto.md` | Schema, use cases, API, job 3, matriz de visibilidad |
| `docs/prd.md` § Sesión de entrega / §12 | Solo canal del donante hoy |
| `docs/architecture.md` §3.4–3.5, §12.2–12.7, Job 3 | Sin `item_requests.contact_channel` ni `receiver_contact_*` |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR20/3.1/4.2/4.6 desalineados con el delta |
| Código actual | `RequestItemUseCase` sin body; `SelectReceiver` sin copia/purga |

---

## 2. Análisis de impacto

### Impacto en épicas

| Épica | Estado actual | Impacto |
|-------|---------------|---------|
| **3** — Solicitudes | `done` | Historia **3.1** requiere AC nuevos (`contactChannel` obligatorio). Historia **3.2** sin cambio (2B: no exponer canal en lista). |
| **4** — Sesión de entrega | `done` | Historias **4.1**, **4.2**, **4.6** y FR20 requieren extensión (nuevos campos, SEC-002c, job ampliado). |
| **5** — Perfil | `done` | Sin impacto directo en listados de solicitudes propias (no se expone canal histórico). |
| **9** — Emails marca | `in-progress` | Sin cambio (4A: EVT-006 sin canal). §7 delta (copy TPL-006) **fuera de alcance** de Épica 12. |
| **10–11** | `in-progress` | Sin impacto en ranking/reputación/digest. |

**Conclusión épica:** No invalida épicas futuras. Se recomienda **Épica 12** dedicada (patrón Épica 9/10/11 post-MVP) en lugar de reabrir 3 y 4 como `in-progress`, para preservar trazabilidad del MVP cerrado.

### Impacto en historias (propuesta Épica 12 — 3 historias)

| ID | Título | Alcance (agrupa) |
|----|--------|------------------|
| **12-1** | Schema y jobs de purga | Migración: `item_requests.contact_channel`, `delivery_sessions.receiver_contact_channel` + `receiver_contact_purged`, índice `idx_sessions_contact_purge`; Job 3 pg_cron ampliado (purga dual). Tests de migración / smoke SQL si aplica. |
| **12-2** | API: postulación, selección y sesión | `RequestItem` (body `contactChannel` obligatorio), `SelectReceiver` (lectura pre-tx, copia, purga `item_requests`), `GetDeliverySession` (SEC-002c, `receiverContactChannel`); repos, validators Zod, OpenAPI, tests Vitest de integración/use-case. |
| **12-3** | Sincronización de artefactos | `docs/prd.md`, `docs/architecture.md`, `epics.md` (FR27–30, Épica 12, notas supersede en 3.1/4.x). Publicar `openapi/openapi.json` como parte del cierre de 12-2. |

**Fuera de alcance Épica 12:** UI Angular (`no-lo-vendo`), regeneración de cliente en frontend, TPL-006 §7 delta.

### Conflictos de artefactos

| Artefacto | Secciones afectadas | Acción |
|-----------|---------------------|--------|
| `docs/prd.md` | § Sesión de entrega, §8 paso 2, §12 Flujo de entrega | Añadir canal candidato + simetría donante |
| `docs/architecture.md` | §3.4, §3.5, índices, Job 3, §12.2–12.7, contratos API F5/F6 | Alinear con delta §2–5 |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | FR map, Épica 3/4 notas, nueva Épica 12 | Nuevas historias + nota “supersede parcial” en 3.1/4.x |
| `_bmad-output/initiative-backend/ux-design-specification/ux-design-specification.md` | Journey solicitud → entrega | Referencia futura; **no** historia en Épica 12 |
| `docs/project/*.html` | Wireframes | Idem — fuera de alcance backend |
| `no-lo-vendo` | Cliente generado | Fuera de alcance; consumidor actualizará cuando corresponda |
| `email-flow-mapping.md` | — | Sin cambio (4A) |
| `ranking-*.md`, `prd-analytics.md` | — | Sin cambio |

### Impacto técnico

- **Backend (Épica 12):** 1 migración SQL, 3 use cases, repositorios, validators Zod, OpenAPI, tests Vitest, job cron SQL, sync docs.
- **Frontend:** no incluido en esta épica; contrato API breaking en `POST .../requests` queda documentado en OpenAPI para adopción posterior.
- **Infra:** sin cambios en `render.yaml` / Railway salvo redeploy normal.
- **Datos existentes:** `item_requests` y sesiones activas sin `contact_channel` del candidato — candidatos en `pending` deberán re-postular o política de migración (ver riesgos).

### Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Solicitudes `pending` sin canal tras deploy | Media | Migración no backfill; forzar nuevo submit o ventana de gracia con 400 claro |
| Romper clientes que llaman POST sin body | Alta | OpenAPI + changelog; frontend fuera de épica — coordinar deploy con consumidores |
| Condición de carrera en `SelectReceiver` | Baja | Lectura pre-transacción + tx atómica (patrón SEC-006) |

---

## 3. Enfoque recomendado

**Opción seleccionada:** **1 — Ajuste directo** (nueva Épica 12, sin rollback ni recorte de MVP).

| Opción | Viabilidad | Notas |
|--------|------------|-------|
| 1 Direct Adjustment | **Viable** | Extiende modelo simétrico; no contradice objetivos PRD |
| 2 Rollback | No viable | Revertir Épica 4 no aporta; el gap es funcional nuevo |
| 3 MVP Review | No viable | Refuerza MVP (desbloqueo de entregas), no lo reduce |

- **Esfuerzo:** Medio-bajo (backend ~2–4 días en 3 historias, QA regresión API sesión/contacto).
- **Riesgo:** Medio (contrato API breaking en POST requests).
- **Timeline:** Encajar tras cierre de Épica 11 (review actual) o en paralelo si capacidad.

---

## 4. Propuestas de cambio detalladas

### 4.1 PRD — `docs/prd.md`

**Sección: Sesión de entrega (aprox. líneas 112–120)**

OLD:
```markdown
- Canal de contacto externo — introducido por el donante en el momento de confirmar la selección
- El canal de contacto se revela al receptor únicamente cuando la sesión está en estado `active`
```

NEW:
```markdown
- Canal de contacto del donante — introducido al seleccionar receptor (`POST .../select`)
- Canal de contacto del candidato — introducido al postularse (`POST .../requests`); copiado a la sesión al seleccionar; visible al donante solo en sesión `active` y antes de purga (no en listado de candidatos ni en emails)
- El canal del donante se revela al receptor en sesión `active` (`contactChannel` / SEC-002)
- El canal del candidato se revela al donante en sesión `active` (`receiverContactChannel` / SEC-002c)
```

**Rationale:** Alinea PRD con decisiones 1A, 2B, 3C.

---

**Sección: §8 Flujo de objeto, paso 2**

OLD:
```markdown
2. Solicitudes de receptores
```

NEW:
```markdown
2. Solicitudes de receptores (con canal de contacto obligatorio en el payload)
```

---

**Sección: §12 Flujo de entrega**

Añadir viñeta:
```markdown
- Tras selección, el donante puede contactar al receptor de forma proactiva mediante `receiverContactChannel` en la sesión activa
- Los canales en `item_requests` se purgan al seleccionar receptor (ganador y rechazados)
- Ambos canales en `delivery_sessions` se purgan a los 7 días de cierre (job pg_cron)
```

---

### 4.2 Architecture — `docs/architecture.md`

Aplicar textualmente las secciones del delta §2–5 y §6 (tabla de documentos). Cambios mínimos obligatorios:

1. **§3.4** — columna `contact_channel TEXT` en `item_requests`
2. **§3.5** — `receiver_contact_channel`, `receiver_contact_purged`
3. **Índice** — `idx_sessions_contact_purge` con OR en WHERE
4. **§12.4** — input `contactChannel` obligatorio
5. **§12.7** — secuencia copia + NULL en `item_requests`
6. **§12.2** — nueva subsección **SEC-002c** + tabla de visibilidad (delta §3.3)
7. **Job 3** — UPDATE dual
8. **API** — POST requests body; GET session `receiverContactChannel`

---

### 4.3 Epics — `_bmad-output/initiative-backend/archive-v6/epics.md`

**FR map — añadir:**

```markdown
FR49: El candidato debe proporcionar canal de contacto al postularse (`POST /items/:id/requests`). El canal no se expone en `GET /items/:id/requests` (lista candidatos).
FR50: Tras selección, el donante recibe `receiverContactChannel` en `GET /delivery-sessions/:id` solo si es donante, sesión `active` y `receiver_contact_purged = FALSE`.
FR51: Al seleccionar receptor, copiar canal del candidato a `delivery_sessions` y purgar `item_requests.contact_channel` (seleccionado y rechazados) en la misma transacción.
FR52: Job `purge-contact-channel` purga ambos canales de sesión a los 7 días de cierre.
```

**Nueva épica (insertar tras Épica 11):**

```markdown
## Épica 12: Canal de contacto del candidato (Correct Course 2026-05-31)

**Origen:** `docs/delta-candidato-contacto.md`  
**FRs:** FR49, FR50, FR51, FR52 (extiende FR12, FR19–FR20, FR26 sin contradecir emails/ranking)

El receptor aporta canal al solicitar; el donante lo ve en sesión activa para iniciar contacto proactivo. Simetría con canal del donante. **Tres historias:** 12-1 (schema/jobs), 12-2 (API), 12-3 (docs).

**Nota:** Las historias 3.1, 4.1, 4.2 y 4.6 del MVP describen el comportamiento previo; la implementación vigente queda superseded por 12-1 y 12-2.
```

**Historia 3.1 — AC a añadir (vía 12-2; documentados en 12-3):**

OLD:
```markdown
**Dado** que envío `POST /items/:id/requests` con autenticación válida...
```

NEW (añadir escenario):
```markdown
**Dado** que envío `POST /items/:id/requests` con `{ "contactChannel": "WhatsApp: ..." }` válido y no vacío
**Entonces** el registro en `item_requests` incluye `contact_channel` con ese valor

**Dado** que envío la petición sin `contactChannel` o con valor vacío
**Entonces** responde `400` con mensaje indicando que `contactChannel` es requerido
```

**Historia 4.2 — AC a añadir:**

```markdown
**Dado** que el solicitante es el donante, la sesión está `active` y `receiver_contact_purged = FALSE`
**Entonces** `receiverContactChannel` incluye el valor del candidato

**Dado** que el solicitante es el receptor
**Entonces** `receiverContactChannel` es siempre `null`
```

---

### 4.4 Historias de implementación (criterios resumidos)

**12-1 — Schema y jobs**

- Migración aplicable en entornos existentes sin backfill de `contact_channel` en filas `pending`.
- Índice parcial actualizado según delta §2.3.
- Job `purge-contact-channel` purga `contact_channel` y `receiver_contact_channel` + flags en sesiones cerradas >7 días.

**12-2 — API**

- `POST /items/:id/requests` exige `{ contactChannel }`; 400 si ausente/vacío; 201 sin exponer canal en listados.
- `SelectReceiver`: copia a `receiver_contact_channel`, `NULL` en todos los `item_requests` del ítem en la misma tx.
- `GET /delivery-sessions/:id`: `receiverContactChannel` solo donante + `active` + `receiver_contact_purged = false`.
- OpenAPI y tests Vitest alineados.

**12-3 — Documentación**

- PRD, architecture y epics reflejan FR49–52 y SEC-002c.
- `openapi/openapi.json` actualizado al cerrar 12-2.

---

## 5. Handoff de implementación

### Clasificación de alcance: **Moderado** (acotado a backend)

Nueva épica en backlog (3 historias). Sin replanificación estratégica (no Major).

### Destinatarios

| Rol | Responsabilidad |
|-----|-----------------|
| **PO / Correct Course** | Aprobar propuesta revisada; Épica 12 en `epics.md` y `sprint-status.yaml` |
| **Developer (backend)** | Historias 12-1, 12-2, 12-3 en orden |

### Criterios de éxito

- [ ] Checklist técnico delta §8 verificado en code review (12-2)
- [ ] Donante activo recibe `receiverContactChannel` en `GET /delivery-sessions/:id`
- [ ] Receptor no recibe `receiverContactChannel`; sí `contactChannel` del donante cuando aplica
- [ ] Tras `SelectReceiver`, ningún `item_requests.contact_channel` persistido
- [ ] Job 3 purga ambos canales y flags (12-1)
- [ ] PRD y `architecture.md` sincronizados (12-3)

### Secuencia sugerida

1. **12-1** — schema + Job 3  
2. **12-2** — use cases + OpenAPI + tests (depende de 12-1)  
3. **12-3** — documentación + cierre FR en epics (depende de 12-2)  

---

## 6. Checklist Correct Course (resumen)

### §1 Trigger
- [x] **1.1** Story/epic: Correct Course 2026-05-31; delta candidato-contacto  
- [x] **1.2** Tipo: nuevo requisito de producto (comunicación simétrica)  
- [x] **1.3** Evidencia: delta + desalineación PRD/architecture/código  

### §2 Epics
- [x] **2.1** Épicas 3–4 completadas; extensión vía Épica 12  
- [x] **2.2** Modificar AC (notas supersede), no reescribir historias done in-place  
- [x] **2.3** Épicas 9–11 sin bloqueo crítico  
- [x] **2.4** Nueva épica 12; ninguna épica obsoleta  
- [x] **2.5** Prioridad: después de 11-3/11-4 en review o paralelo  

### §3 Artefactos
- [x] **3.1** PRD — actualización acotada, MVP intacto  
- [x] **3.2** Architecture — cambio sustancial documentado en delta  
- [x] **3.3** UX — fuera de épica 12 (seguimiento aparte)  
- [x] **3.4** OpenAPI, migraciones, tests (backend)  

### §4 Path forward
- [x] **4.1** Direct Adjustment — viable, esfuerzo medio  
- [N/A] **4.2** Rollback  
- [N/A] **4.3** MVP reduction  
- [x] **4.4** Opción 1 seleccionada  

### §5–6 Propuesta y handoff
- [x] **5.1–5.5** Documento completo  
- [x] **6.3** Aprobación explícita del usuario — **aprobada 2026-05-31 (Emanuel)**  
- [x] **6.4** Actualizar `sprint-status.yaml` y `epics.md` — completado  
- [x] **6.5** Handoff a Developer — ver §5  

---

## 7. Validación técnica del delta (checklist §8)

| Ítem delta | Veredicto |
|------------|-----------|
| Schema `receiver_contact_*` | Coherente con patrón `contact_purged` existente |
| Secuencia `SelectReceiver` | Correcta; alinear con lectura pre-tx en repo |
| SEC-002c vs SEC-002/002b | Coherente; tabla visibilidad en delta es canónica |
| TPL-006 UX §7 | **Fuera de alcance** Épica 12 (decisión 4A; sin historia) |

---

*Generado por workflow bmad-correct-course · 2026-05-31 · Revisión: 3 historias, sin frontend/TPL-006*
