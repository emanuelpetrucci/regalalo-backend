# Especificación técnica — Modificaciones al sistema de ranking y reputación
**Proyecto:** Regálalo, lo regalo  
**Documento:** RFC-RANK-2026-01 a RFC-RANK-2026-04  
**Estado:** ✅ APROBADO  
**Fecha aprobación:** 29 mayo 2026  
**Versión:** 1.0  
**Autor:** PM / Diseño técnico  

---

## Índice

1. [Resumen ejecutivo de cambios](#1-resumen-ejecutivo-de-cambios)
2. [RFC-001 — Asimetría de deltas en delivery_completed](#2-rfc-001--asimetría-de-deltas-en-delivery_completed)
3. [RFC-002 — Reducción de base de penalización por no-show](#3-rfc-002--reducción-de-base-de-penalización-por-no-show)
4. [RFC-003 — Nuevos niveles de control de acaparador (reemplaza FR18)](#4-rfc-003--nuevos-niveles-de-control-de-acaparador-reemplaza-fr18)
5. [RFC-004 — Incentivo de primera donación (evento de rehabilitación)](#5-rfc-004--incentivo-de-primera-donación-evento-de-rehabilitación)
6. [Migración de esquema](#6-migración-de-esquema)
7. [Cambios en capa de servicio](#7-cambios-en-capa-de-servicio)
8. [SQL actualizado — findRankedCandidates](#8-sql-actualizado--findrankedcandidates)
9. [Fórmula consolidada de reputación](#9-fórmula-consolidada-de-reputación)
10. [Inventario de archivos afectados](#10-inventario-de-archivos-afectados)
11. [Implicaciones en analítica (AE-030)](#11-implicaciones-en-analítica-ae-030)
12. [Matriz de verificación QA](#12-matriz-de-verificación-qa)
13. [Decisiones de diseño documentadas](#13-decisiones-de-diseño-documentadas)
14. [Documentos que requieren actualización](#14-documentos-que-requieren-actualización)

---

## 1. Resumen ejecutivo de cambios

| RFC | Área | Tipo de cambio | Archivos principales |
|-----|------|----------------|----------------------|
| RFC-001 | Reputación | Delta donante ≠ delta receptor en `delivery_completed` | `reputation.service.ts`, `architecture.md`, `delivery-session.repository.ts` |
| RFC-002 | Reputación | Base no-show: de -20 a -10 | `reputation.service.ts`, `architecture.md` |
| RFC-003 | Ranking | Reemplaza lógica acaparador FR18 por dos niveles (penalización / exclusión) | `request.repository.ts`, `ranked-candidate-filters.ts`, `prd.md` |
| RFC-004 | Reputación | Delta de primera donación: +15 en lugar de +10 | `reputation.service.ts`, `architecture.md` |
| MIGR-001 | Base de datos | Añadir columna `role` a `reputation_events` | Migración SQL |

**Ninguno de estos cambios modifica:** tipos de evento (`delivery_completed`, `no_show`), nombres de campos existentes, el flujo de `delivery_sessions`, la lógica de usuario pasivo (FR17), la perturbación aleatoria ±2, ni el esquema de `users`.

---

## 2. RFC-001 — Asimetría de deltas en `delivery_completed`

### Estado anterior

Al confirmar una entrega (`ConfirmDelivery`), tanto donante como receptor recibían `+10` de reputación.

```
delivery_completed → donante  +10
delivery_completed → receptor +10
```

### Estado nuevo

```
delivery_completed → donante  +10  (sin cambio salvo RFC-004 para primera donación)
delivery_completed → receptor +1
```

### Justificación de diseño

El sistema debe incentivar la donación como comportamiento primario. Un receptor que acumula objetos sin donar nunca recupera reputación de forma significativa con +1 por recepción; su única vía de recuperación rápida es convertirse en donante.

### Implicación de trade-off — documentada formalmente

Con la combinación RFC-001 + RFC-002, la **ratio castigo/recuperación del receptor** es **10:1**:

- Por cada no-show: `-10` (primer evento)
- Por cada recepción completada: `+1`
- Para recuperar un solo no-show: 10 recepciones exitosas como receptor, o 1 donación exitosa (+10)

Esto es intencional. La recuperación significativa de reputación queda reservada al rol de donante.

### Cambios técnicos requeridos

`onDeliveryCompleted` pasa de recibir un único `user: User` a recibir `donor: User, receiver: User` y emite **dos** eventos de reputación distintos con roles diferenciados.

Los dos `UPDATE` sobre `users` se mantienen en la misma transacción atómica que ya existe en `ConfirmDelivery`.

---

## 3. RFC-002 — Reducción de base de penalización por no-show

### Estado anterior

```
delta_no_show = -20 × consecutive_no_shows
```

### Estado nuevo

```
delta_no_show = -10 × consecutive_no_shows
```

La base se alinea con el delta que el sistema otorga al donante por una entrega completada. La acumulatividad por racha consecutiva se mantiene sin cambios.

### Tabla de progresión (nuevo)

| No-show en racha | Delta aplicado | Ejemplo: score previo 0 |
|-----------------|---------------|------------------------|
| 1.º consecutivo | -10 | -10 |
| 2.º consecutivo | -20 | -30 |
| 3.º consecutivo | -30 | -60 |
| Tras entrega OK → racha a 0 | — | +1 (si receptor) |
| Siguiente no-show | -10 | vuelve a -10 sobre el score actual |

### Cambios técnicos requeridos

Cambio aritmético puro en `onNoShow`: constante `-20` → `-10`. Sin impacto en esquema ni en otros flujos.

---

## 4. RFC-003 — Nuevos niveles de control de acaparador (reemplaza FR18)

### Estado anterior (FR18 — eliminado)

```sql
-- Condición acaparador (eliminada en su totalidad)
cycles_at_limit >= 3
AND total_received > 5 × total_donated
-- Efecto: -15 sobre effective_score (penalización, permanece visible)
```

### Estado nuevo — dos niveles

La nueva lógica reemplaza completamente FR18. La condición simplificada es binaria: **¿ha donado alguna vez?** (`total_donated = 0`). No se evalúa el ratio de recepciones.

#### Nivel 1 — Penalización (Tier 1)

**Condición:**
```
cycles_at_limit >= 1
AND total_donated = 0
```

**Efecto:** `-15` sobre `effective_score`. El candidato **sigue siendo visible** en la lista de candidatos del donante, pero aparece en posición inferior.

**Interpretación:** el usuario ha agotado sus 3 cupos de solicitud en al menos 1 ciclo de 30 días y nunca ha completado ninguna donación.

#### Nivel 2 — Exclusión completa (Tier 2)

**Condición:**
```
cycles_at_limit >= 2
AND total_donated = 0
```

**Efecto:** el usuario **no aparece** en la lista de candidatos (`WHERE` clause). No es visible para ningún donante.

**Interpretación:** el usuario ha agotado sus cupos en al menos 2 ciclos consecutivos de 30 días y nunca ha donado. Equivale a haber pedido objetos durante 60+ días de forma intensiva sin ninguna contribución.

#### Ruta de rehabilitación

Completar una única donación (`total_donated >= 1`) elimina inmediatamente ambas condiciones. No se requiere reset de `cycles_at_limit`. El efecto es instantáneo al cierre de la sesión de entrega.

### Interacción con exclusión de usuario pasivo (FR17 — sin cambios)

Las dos exclusiones son independientes y no interfieren entre sí:

| Situación | FR17 (pasivo) | RFC-003 Tier 2 | Resultado |
|-----------|---------------|----------------|-----------|
| `total_donated=0`, `total_received>0`, inactivo >60d, `cycles_at_limit<2` | Sí excluye | No aplica | Excluido (FR17) |
| `cycles_at_limit>=2`, `total_donated=0`, activo | No aplica | Sí excluye | Excluido (Tier 2) |
| Cumple ambas | Sí excluye | Sí excluye | Excluido (redundante, sin conflicto) |

### Decisión de diseño documentada — ratio de recepciones eliminado

La condición anterior `total_received > 5 × total_donated` queda suprimida. Bajo el nuevo esquema, un usuario que ha completado **al menos 1 donación** (`total_donated >= 1`) nunca activa Tier 1 ni Tier 2, independientemente de cuántas recepciones haya acumulado. Esto es una simplificación deliberada: el sistema premia haber donado alguna vez, sin imponer una ratio mínima de reciprocidad.

---

## 5. RFC-004 — Incentivo de primera donación (evento de rehabilitación)

### Lógica

Al ejecutar `ConfirmDelivery`, antes de incrementar `total_donated`, se evalúa si el donante está completando su **primera donación histórica**:

```
IF donor.total_donated === 0 BEFORE this transaction
  THEN delta_donante = +15   -- delta de primera donación
  ELSE delta_donante = +10   -- delta estándar
```

El tipo de evento registrado en `reputation_events` sigue siendo `delivery_completed`. Solo cambia el valor del campo `delta`.

### Alcance

Este incentivo aplica **exclusivamente al donante**. El receptor recibe `+1` independientemente de si es la primera donación del donante.

### Condición de disparo

La condición se verifica **dentro de la transacción atómica** de `ConfirmDelivery`, leyendo `users.total_donated` antes del `UPDATE` correspondiente. No requiere campo adicional en la base de datos.

### Caso de interacción con RFC-003

Un usuario en Tier 1 (`cycles_at_limit >= 1`, `total_donated = 0`) que completa su primera donación:
1. Recibe `+15` de reputación (RFC-004).
2. `total_donated` pasa a `1`.
3. Condición `total_donated = 0` deja de cumplirse.
4. Sale inmediatamente de Tier 1 en el ranking.

Tres incentivos convergen en el mismo evento: puntos extra, salida de penalización de ranking, y rehabilitación del ratio de reciprocidad.

---

## 6. Migración de esquema

### MIGR-001 — Columna `role` en `reputation_events`

La tabla `reputation_events` actualmente no distingue el rol del usuario en el evento. Con la asimetría de deltas introducida en RFC-001, la auditoría requiere saber si el delta corresponde al rol de donante o receptor.

```sql
-- Migración: añadir columna role a reputation_events
ALTER TABLE reputation_events
  ADD COLUMN IF NOT EXISTS role VARCHAR(8)
    CHECK (role IN ('donor', 'receiver'))
    NULL;

COMMENT ON COLUMN reputation_events.role IS
  'Rol del usuario en la sesión de entrega. NULL en filas anteriores a MIGR-001.
   donor = donante que confirmó la entrega.
   receiver = receptor (en delivery_completed) o receptor penalizado (en no_show).';
```

**Filas históricas:** `role = NULL`. No se retroalimentan (el score en `users` es la fuente de verdad operativa; `reputation_events` es auditoría).

**Sin cambios al resto del esquema de `users`.** Los campos `total_donated`, `total_received`, `consecutive_no_shows`, `cycles_at_limit` y `reputation_score` mantienen su definición actual.

---

## 7. Cambios en capa de servicio

### `ReputationService` — lógica actualizada

```typescript
// RFC-001 + RFC-004: delivery_completed con asimetría de roles
function onDeliveryCompleted(
  donor: User,
  receiver: User
): ReputationEvent[] {
  // -- Donante --
  // RFC-004: primera donación recibe +15; donaciones posteriores +10
  const donorDelta = donor.totalDonated === 0 ? +15 : +10;

  donor.consecutiveNoShows = 0;          // reset (puede ser también receptor en otras sesiones)
  donor.reputationScore += donorDelta;
  donor.totalDonated += 1;

  // -- Receptor --
  // RFC-001: receptor recibe +1
  receiver.consecutiveNoShows = 0;
  receiver.reputationScore += 1;
  receiver.totalReceived += 1;

  return [
    { type: 'delivery_completed', role: 'donor',    delta: donorDelta },
    { type: 'delivery_completed', role: 'receiver', delta: +1 }
  ];
}

// RFC-002: base no-show de -20 a -10
function onNoShow(receiver: User): ReputationEvent {
  receiver.consecutiveNoShows += 1;
  const delta = -10 * receiver.consecutiveNoShows;   // era -20
  receiver.reputationScore += delta;
  return { type: 'no_show', role: 'receiver', delta };
}
```

### `ConfirmDelivery` (architecture.md §12.5) — secuencia actualizada

```
Secuencia en transacción atómica:
  1. donor_confirmed = TRUE
  2. status = 'completed', completed_at = NOW()
  3. Leer donor.total_donated ANTES de cualquier UPDATE (para RFC-004)
  4. Calcular donorDelta:
       IF donor.total_donated === 0 THEN +15 ELSE +10
  5. Aplicar donorDelta al donante (reputation_score, consecutive_no_shows=0, total_donated++)
  6. Aplicar +1 al receptor (reputation_score, consecutive_no_shows=0, total_received++)
  7. Registrar dos filas en reputation_events:
       { user_id: donor_id,   type: 'delivery_completed', role: 'donor',    delta: donorDelta, session_id }
       { user_id: receiver_id, type: 'delivery_completed', role: 'receiver', delta: +1,         session_id }
```

### `CancelDelivery` con `noShow = true` (architecture.md §12.6) — secuencia actualizada

```
Si noShow === true:
  a. consecutive_no_shows++ (receptor)
  b. delta = -10 × consecutive_no_shows   ← era -20
  c. reputation_score += delta (receptor)
  d. Registrar en reputation_events:
       { user_id: receiver_id, type: 'no_show', role: 'receiver', delta, session_id }
```

---

## 8. SQL actualizado — `findRankedCandidates`

```sql
SELECT
  u.id,
  u.reputation_score,
  ST_Distance(u.location, i.location)              AS distance_meters,
  r.created_at                                     AS request_date,
  (
    u.reputation_score
    -- RFC-003 Tier 1: penalización -15 sobre effective_score
    -- (Tier 2 ya fue excluido en WHERE; esta cláusula aplica solo a cycles_at_limit = 1)
    - CASE
        WHEN (u.cycles_at_limit >= 1 AND u.total_donated = 0)
        THEN 15
        ELSE 0
      END
    + (FLOOR(RANDOM() * 5 - 2))::int               -- perturbación ±2 (sin cambio)
  )                                                AS effective_score
FROM item_requests r
JOIN users u ON u.id = r.requester_id
JOIN items i ON i.id = r.item_id
WHERE r.item_id = $1
  AND r.status  = 'pending'
  AND ST_DWithin(u.location, i.location, 50000)

  -- Exclusión FR17: usuario pasivo (sin cambio)
  AND NOT (
    u.total_donated = 0
    AND u.total_received > 0
    AND u.last_active_at IS NOT NULL
    AND u.last_active_at < NOW() - INTERVAL '60 days'
  )

  -- Exclusión RFC-003 Tier 2: acaparador severo (reemplaza FR18)
  AND NOT (
    u.cycles_at_limit >= 2
    AND u.total_donated = 0
  )

ORDER BY
  effective_score  DESC,
  distance_meters  ASC,
  request_date     ASC;
```

### Eliminado del WHERE

```sql
-- ELIMINADO (FR18 anterior):
AND NOT (
  u.cycles_at_limit >= 3
  AND u.total_received > 5 * u.total_donated
)
```

### Eliminado del CASE en effective_score

```sql
-- ELIMINADO (penalización acaparador anterior):
- CASE WHEN (
    u.cycles_at_limit >= 3
    AND u.total_received > 5 * u.total_donated
  ) THEN 15 ELSE 0 END
```

El fragmento en `ranked-candidate-filters.ts` debe actualizarse en paralelo, ya que es compartido con el endpoint `GET /users/me/items` → `requestCount`.

---

## 9. Fórmula consolidada de reputación

### Estado anterior

```
reputation_score(t) =
    0
  + Σ(entregas como donante)  × (+10)
  + Σ(entregas como receptor) × (+10)
  + Σ(no_shows como receptor) × (-20 × consecutividad_en_ese_momento)
```

### Estado nuevo

```
reputation_score(t) =
    0
  + [+15 si total_donated_prev = 0, +10 en caso contrario]   ← primera entrega como donante
  + Σ(entregas subsiguientes como donante) × (+10)
  + Σ(entregas como receptor) × (+1)                         ← RFC-001
  + Σ(no_shows como receptor) × (-10 × consecutividad)       ← RFC-002

Sin mínimo. Sin recuperación pasiva por tiempo.
```

### Ejemplo de ciclo mixto (donante + receptor)

```
Registro                              → 0 pts
Recibe objeto #1 (receptor)           → +1   = 1 pt
No-show en sesión A (1.º seguido)     → -10  = -9 pts
No-show en sesión B (2.º seguido)     → -20  = -29 pts
Primera donación completada (donante) → +15  = -14 pts  [RFC-004 + racha a 0]
  cycles_at_limit = 1 → total_donated = 1 → sale de Tier 1 inmediatamente
Recibe objeto #2 (receptor)           → +1   = -13 pts
No-show en sesión C (1.º seguido)     → -10  = -23 pts  [racha reiniciada]
Donación #2 completada (donante)      → +10  = -13 pts  [racha a 0]
```

---

## 10. Inventario de archivos afectados

| Archivo | Tipo de cambio | RFC |
|---------|---------------|-----|
| `src/domain/services/reputation.service.ts` | Lógica: asimetría deltas, base no-show, primera donación | RFC-001, RFC-002, RFC-004 |
| `src/infrastructure/database/supabase/delivery-session.repository.ts` | Pasar `donor` y `receiver` separados; nueva secuencia confirm/cancel | RFC-001, RFC-002, RFC-004 |
| `src/infrastructure/database/sql/ranked-candidate-filters.ts` | Reemplazar filtro FR18 por Tier 2; actualizar penalización CASE por Tier 1 | RFC-003 |
| `src/infrastructure/database/supabase/request.repository.ts` → `findRankedCandidates` | SQL actualizado (§8) | RFC-003 |
| `src/infrastructure/database/migrations/YYYYMMDD_add_role_to_reputation_events.sql` | Migración MIGR-001 | MIGR-001 |
| `docs/architecture.md` §5.1, §5.2, §5.3, §6.3, §6.5, §12.5, §12.6 | Documentación técnica | Todos |
| `docs/prd.md` §10, §11 | Requisitos de producto | RFC-001–004, RFC-003 |
| `docs/ranking-system.md` §2 (eventos), §3.2 (acaparador), §4 (filtro pasivo) | Guía técnica | Todos |
| `docs/ranking-guia-producto.md` | Tabla resumen reputación, tabla no-show, sección acaparador | Todos |

---

## 11. Implicaciones en analítica (AE-030)

El evento `reputation.changed` (AE-030) emite `properties: { delta, type, newScore, consecutiveNoShows }`.

Con estos cambios, los valores de `delta` que circulan por el pipeline analítico pasan de `{ +10, -20n }` a `{ +1, +10, +15, -10n }`. **No se requieren cambios al esquema de `analytics_events` ni al contrato del evento.** Los dashboards o queries que filtren `delta = 10` deberán ampliarse para incluir `delta IN (1, 10, 15)` si pretenden capturar todos los eventos positivos de `delivery_completed`.

Recomendación post-merge: revisar queries analíticas existentes sobre AE-030 antes del primer despliegue en producción.

---

## 12. Matriz de verificación QA

| ID | Caso de prueba | Resultado esperado |
|----|---------------|-------------------|
| QA-01 | Donante confirma entrega; `total_donated_prev > 0` | Donante `+10`, receptor `+1`; dos filas en `reputation_events` con roles distintos |
| QA-02 | Donante confirma entrega; `total_donated_prev = 0` (primera donación) | Donante `+15`, receptor `+1`; `role='donor'` delta=15 en events |
| QA-03 | Donante declara no-show (1.º consecutivo del receptor) | Receptor `-10`; `consecutive_no_shows = 1` |
| QA-04 | Donante declara no-show (2.º consecutivo del receptor) | Receptor `-20`; `consecutive_no_shows = 2` |
| QA-05 | Donante declara no-show (3.º consecutivo del receptor) | Receptor `-30`; `consecutive_no_shows = 3` |
| QA-06 | Entrega completada después de racha de no-shows | `consecutive_no_shows = 0` en ambos; siguient no-show vuelve a ser `-10` |
| QA-07 | Usuario con `cycles_at_limit=0, total_donated=0` solicita objeto | Aparece en ranking, sin penalización |
| QA-08 | Usuario con `cycles_at_limit=1, total_donated=0` solicita objeto | Aparece en ranking con `-15` sobre `effective_score` (Tier 1) |
| QA-09 | Usuario con `cycles_at_limit=2, total_donated=0` solicita objeto | No aparece en `candidates[]`; no cuenta en `requestCount` |
| QA-10 | Usuario Tier 2 completa primera donación | Inmediatamente visible en ranking en siguiente consulta; recibe `+15` |
| QA-11 | Usuario con `cycles_at_limit=5, total_donated=1` solicita objeto | Sin penalización Tier 1 ni exclusión Tier 2 (total_donated >= 1) |
| QA-12 | Usuario pasivo (FR17) con `cycles_at_limit=1, total_donated=0` | Excluido por FR17; Tier 1 no se evalúa (ya excluido) |
| QA-13 | Dos refrescos seguidos del ranking | Orden puede variar por perturbación ±2 (comportamiento esperado) |
| QA-14 | `GET /users/me/items` → `requestCount` | Excluye Tier 2 y pasivos; coincide con `candidates[]` del detalle |

---

## 13. Decisiones de diseño documentadas

Las siguientes decisiones se registran formalmente por su carácter irreversible o por su impacto en comportamiento de usuario:

**DD-01 — Ratio de recuperación del receptor (10:1)**  
Combinación de RFC-001 (+1 por recepción) y RFC-002 (-10 base no-show) resulta en que la única vía de recuperación significativa de reputación para un receptor es convertirse en donante. Esto es consecuencia intencional y deliberada del diseño, no un efecto colateral.

**DD-02 — Eliminación del ratio `total_received / total_donated`**  
La condición anterior `total_received > 5 × total_donated` queda eliminada. Bajo el nuevo esquema, completar una única donación (`total_donated >= 1`) exime al usuario de toda penalización de acaparador, sin importar cuántos objetos haya recibido. Se prioriza incentivar el primer gesto de donación sobre cualquier ratio de reciprocidad sostenida.  
**Aclaración arquitectónica (confirmada en revisión):** la acumulación masiva de recepciones sin ninguna donación es estructuralmente imposible bajo las reglas combinadas del sistema. Un usuario con `total_donated = 0` que solicita objetos de forma intensiva activa Tier 2 (`cycles_at_limit >= 2`) antes de poder recibir un volumen elevado, ya que la exclusión del listado de candidatos le impide ser seleccionado como receptor. La eliminación del ratio no crea una ventana de abuso; el sistema es autolimitante por diseño.

**DD-03 — Rehabilitación por donación, no por tiempo**  
El sistema no contempla recuperación pasiva. Un usuario en Tier 2 permanece excluido indefinidamente hasta completar una entrega como donante. No existe umbral temporal que revierta la exclusión.

**DD-04 — `cycles_at_limit` no se resetea al donar**  
El contador `cycles_at_limit` no se reinicia cuando un usuario completa una donación. La condición `total_donated = 0` deja de cumplirse, pero el historial de ciclos permanece en la base de datos. Esto es correcto: el contador es un registro histórico de comportamiento, no una deuda que se cancela.

---

## 14. Documentos que requieren actualización

Los siguientes documentos deben sincronizarse con esta especificación **antes de marcar los PRs como listos para revisión**:

| Documento | Secciones afectadas |
|-----------|---------------------|
| `architecture.md` | §5.1 (tabla deltas), §5.2 (pseudocódigo `onDeliveryCompleted`, `onNoShow`), §5.3 (fórmula), §6.3 (SQL `findRankedCandidates`), §6.5 (condición acaparador), §12.5 (`ConfirmDelivery`), §12.6 (`CancelDelivery`) |
| `prd.md` | §10 (tabla eventos y reglas), §11 (definición acaparador — reemplazar FR18 por Tier 1/Tier 2) |
| `ranking-system.md` | §2 (tabla eventos de reputación), §3.2 (penalización acaparador → Tier 1), §4 (reglas de exclusión — añadir Tier 2) |
| `ranking-guia-producto.md` | Tabla «Cómo se gana o pierde reputación», tabla no-show con nueva progresión, sección acaparador con nueva descripción de dos niveles |

---

*Fin del documento RFC-RANK-2026-01 a RFC-RANK-2026-04 — v1.0*  
*✅ Aprobado el 29 mayo 2026. Listo para fase de implementación.*
