# 📘 PRD MVP — "Regálalo" (v3.0)

> Versión 3.0 — MVP acotado. Derivado de v2.4.
> Cambios respecto a v2.4: eliminación del flujo de necesidades, simplificación del arbitraje de sesiones a confirmación única por donante, eliminación del sistema de reportes y ocultación automática, eliminación de la interfaz de administración. Correcciones técnicas C3–C8 incorporadas.

---

## 🧭 1. Visión del producto

Sistema comunitario de redistribución de objetos donde el acceso a recursos gratuitos se regula mediante comportamiento, reputación y equilibrio dinámico del ecosistema.

No es un marketplace ni una red social.
Es un sistema de asignación meritocrática con control algorítmico.

---

## ⚙️ 2. Principios del sistema

- Acceso abierto, impacto desigual
- El comportamiento condiciona oportunidades
- No existen bloqueos directos
- El sistema actúa sobre consecuencias, no intenciones
- Prioridad absoluta: experiencia del donante
- Regulación mediante degradación progresiva
- Sistema diseñado para ser utilizado **y jugado**

---

## 🔍 3. Transparencia del sistema

### Transparencia parcial

El sistema:
- No revela el algoritmo exacto de ranking
- Sí expone señales interpretables al usuario:
  - reputación visible
  - historial básico
  - indicadores de fiabilidad

👉 Objetivo: equilibrar comprensión del sistema sin permitir explotación directa.

---

## 🎯 4. Alcance del MVP

Sistema funcional centrado en el flujo donante–objeto–receptor. Incluye:

- Autenticación
- Publicación y gestión de objetos
- Sistema de ranking de candidatos
- Sistema de reputación
- Detección de usuarios pasivos y acaparadores
- Sesión de entrega simplificada
- Notificaciones por email (layout de marca compartido — `docs/email-template-design.md`)
- Perfil de usuario

No incluye en esta versión: flujo de necesidades, arbitraje complejo, sistema de reportes, interfaz de administración.

---

## 👥 5. Actores

### Donante
- Publica objetos
- Selecciona receptor mediante ranking
- Confirma entrega
- Experimenta el sistema

### Receptor
- Solicita objetos
- Compite en ranking dinámico

### Sistema
- Ordena
- Prioriza
- Ajusta probabilidades

---

## 🧩 6. Entidades

### Usuario

| Campo | Descripción |
|---|---|
| email | Identificador único |
| first_name / last_name | Nombre y apellido obligatorios en registro (2–50 caracteres, Unicode) |
| avatar_url | URL pública opcional (bucket `avatars/` en Storage) |
| phone | Teléfono opcional; solo visible en perfil privado |
| código postal | Base para geolocalización |
| email_verified | Verificación de email obligatoria tras registro. Enlace con token de un solo uso (24 h). Rutas protegidas bloqueadas hasta verificar (`403 EMAIL_NOT_VERIFIED`). Reenvío con cooldown 30 s. Solo lectura en perfil privado |
| is_active | Control operativo interno; cuentas inactivas no autentican |
| preferred_language | Idioma preferido (MVP: `'es'`) |
| reputation_score | Score operativo — fuente de verdad |
| consecutive_no_shows | Contador de no-shows consecutivos — se resetea al completar entrega |
| cycles_at_limit | Ciclos consecutivos en los que el usuario agotó su límite mensual |
| total_received | Total de objetos recibidos históricamente |
| total_donated | Total de objetos donados históricamente |

> El campo `request_count_30d` no existe. El límite de solicitudes se verifica mediante ventana deslizante de 30 días sobre `item_requests`.

### Objeto

- título, descripción, estado, condición
- Hasta **5 imágenes adjuntas** — comprimidas en cliente (máx. 1200px, WebP, calidad 80%, tope 2MB por imagen)
- Ubicación geográfica propia (puede diferir de la del donante)
- Estados: Active / Reserved / Completed / Cancelled
- Las imágenes de objetos en estado `completed` o `cancelled` se purgan automáticamente a los **30 días** del cambio de estado
- Los objetos sin selección de receptor tras **7 días** se degradan en visibilidad mediante el campo `degraded_at`. Un job de `pg_cron` lo establece y el ranking los ordena al final de los resultados
- El donante puede pausar temporalmente las nuevas solicitudes sobre su objeto mediante el campo `requests_paused`. Mientras está pausado, `POST /items/:id/requests` devuelve 409. Se controla con `PATCH /items/:id/pause`

### Sesión de entrega
- Activada tras selección de receptor
- Canal de contacto del candidato — aportado por el receptor al postularse (`POST /items/:id/requests`); copiado a la sesión al seleccionar receptor
- Canal de contacto del donante — introducido al confirmar la selección; visible solo al receptor en sesión `active`
- El donante puede ver el canal del candidato (`receiverContactChannel`) en sesión `active` para contacto proactivo (SEC-002c)
- Si el donante cancela la sesión, los canales no quedan en ningún historial visible para la otra parte
- Deadline estricto: 7 días — no extensible
- **Confirmación por parte del donante** — el donante confirma la entrega para cerrar la sesión
- Al expirar sin confirmación, la sesión se cierra sin penalización y el objeto vuelve a estado activo
- Ambos campos de contacto (`contact_channel` y `receiver_contact_channel`) se purgan a `NULL` a los **7 días** de que la sesión alcance estado `completed`, `cancelled` o `expired`

---

## 📏 7. Reglas del sistema

- Máximo 3 solicitudes de objetos cada 30 días — verificado mediante **ventana deslizante** de 720 horas
- Email obligatorio
- Radio geográfico: 50 km
- Sin chat interno
- Cierre automático de sesiones al vencer el deadline (7 días)
- Un usuario no puede solicitar su propio objeto

---

## 🔁 8. Flujo de objeto

1. Publicación (con hasta 5 imágenes, **categoría** y **rango de peso** obligatorios — ver `docs/prd-analytics.md` §4)
2. Solicitudes de receptores — el candidato aporta su canal de contacto al postularse
3. Ranking automático de candidatos
4. Selección por el donante (≤ 48h recomendado) — el donante introduce su canal de contacto en este paso
5. Sesión de entrega (≤ 7 días estrictos)
6. Confirmación por el donante

### Degradación por inactividad

Los objetos sin selección de receptor tras **7 días** no se cancelan. El campo `degraded_at` se establece mediante `pg_cron` y los objetos aparecen al final de los resultados de búsqueda hasta que el donante realice una selección.

---

## 📊 9. Sistema de ranking

### Orden de criterios

1. Reputación (reputation_score efectivo)
2. Cercanía geográfica
3. Antigüedad de la solicitud

### Propiedades

- Calculado en tiempo real al visualizar solicitudes
- No determinista: perturbación aleatoria de **±2 puntos** sobre el score efectivo en cada cálculo
- Sensible al comportamiento histórico
- Excluye usuarios pasivos del ranking

---

## 🧠 10. Sistema de reputación

> Fuente de verdad detallada: [ranking-spec-v1.0.md](./ranking-spec-v1.0.md) (RFC-001 a RFC-004, aprobada 2026-05-29).

### Eventos y deltas

| Evento | Delta |
|---|---|
| Entrega completada — donante (ya donó antes) | +10 |
| Entrega completada — donante (primera donación histórica) | +15 |
| Entrega completada — receptor | +1 |
| No-show (receptor) | -10 × consecutive_no_shows |

### Reglas

- **Sin valor mínimo** — el score puede ser negativo sin límite
- **Penalización acumulativa:** cada no-show consecutivo multiplica la penalización base de -10 por el número de no-shows consecutivos. El contador se resetea a 0 al completar una entrega exitosa
- **Recuperación exclusivamente por actividad positiva** — no existe recuperación pasiva por tiempo transcurrido
- El `reputation_score` es un campo calculado que se actualiza en cada evento. No se recalcula desde el historial

**RFC-001 — ratio castigo/recuperación del receptor (10:1):** con la base no-show de -10 y el delta receptor de +1 por entrega, recuperar un solo no-show requiere 10 recepciones exitosas como receptor, o una donación exitosa (+10/+15). La recuperación significativa queda reservada al rol de donante.

### Ejemplo de acumulación

```
No-show #1 → -10  (consecutive_no_shows = 1)
No-show #2 → -20  (consecutive_no_shows = 2)
Entrega    → +1 (receptor) / +10 o +15 (donante); consecutive_no_shows = 0
No-show #1 → -10  (consecutive_no_shows = 1)
```

---

## 📈 11. Sistema de comportamiento

### Usuario pasivo

Un usuario es considerado pasivo si cumple las tres condiciones simultáneamente:

```
total_donated = 0
AND total_received > 0
AND sin actividad en los últimos 60 días
```

Un usuario nuevo sin actividad **no** es considerado pasivo. Solo lo es quien ha recibido objetos y nunca ha donado.

**Efecto:** exclusión del ranking. No afecta el `reputation_score`.

### Usuario acaparador (RFC-003 — supersede FR18 MVP)

> Detalle técnico: [ranking-spec-v1.0.md §4](./ranking-spec-v1.0.md#4-rfc-003--nuevos-niveles-de-control-de-acaparador-reemplaza-fr18)

**Tier 1 (penalización):** `cycles_at_limit >= 1 AND total_donated = 0` → `-15` sobre score efectivo; visible en ranking.

**Tier 2 (exclusión):** `cycles_at_limit >= 2 AND total_donated = 0` → no aparece en candidatos ni en `requestCount`.

**Rehabilitación:** `total_donated >= 1` elimina Tier 1 y Tier 2 de inmediato.

**Definición de ciclo:** un ciclo es un período de 30 días en el que el usuario ha agotado su límite de 3 solicitudes. `cycles_at_limit` se incrementa mediante `pg_cron` una única vez por cada ventana de 30 días en la que se detecte agotamiento del límite. El sistema garantiza que el contador no se incremente más de una vez por ciclo independientemente de la frecuencia de ejecución del job.

**Efecto Tier 1:** penalización de -15 puntos sobre el score efectivo en el ranking. No afecta el `reputation_score` oficial.

**Efecto Tier 2:** exclusión del ranking y del contador `requestCount`. No afecta el `reputation_score` oficial.

### Usuarios adaptativos
- Comportamiento optimizado esperado
- No penalizado si cumple las reglas del sistema

---

## 🔄 12. Flujo de entrega

### Solución implementada

- Confirmación por el donante para completar la sesión
- Cierre automático al vencer deadline de 7 días sin penalización
- Al expirar una sesión, el objeto vuelve a estado activo automáticamente
- El donante recibe notificación por email cuando su objeto vuelve a estar disponible
- El receptor seleccionado recibe notificación por email si el donante cancela el objeto
- El candidato proporciona su canal de contacto al postularse; queda disponible al donante en sesión `active` (`receiverContactChannel`, SEC-002c)
- Ambos canales de contacto (`contact_channel` del donante y `receiver_contact_channel` del receptor) se purgan a los 7 días de cierre de sesión

### Notificaciones por email definidas

| Evento | Destinatario | Contenido |
|---|---|---|
| Sesión expirada sin confirmación | Donante | El objeto ha vuelto a estado activo |
| Donante cancela objeto | Receptor seleccionado | La entrega ha sido cancelada por el donante |
| Digest horario de objetos nuevos en zona | Usuarios activos y con email verificado a ≤50 km (excl. donantes) | Resumen de objetos `active` publicados en la última hora (EVT-015 / TPL-010) |

### Emails transaccionales (marca)

- Todos los emails Resend (TPL-001 a TPL-010) usan layout HTML compartido alineado con el design system del frontend (`no-lo-vendo/docs/project/colors_and_type.css`). Spec: `docs/email-template-design.md`.
- En registro, un único email TPL-009 combina bienvenida breve y verificación (24 h).
- Criterio pre-lanzamiento: ningún email sin layout de marca (Épica 9).
- **Digest de proximidad (MVP):** sin preferencias de opt-out; cron externo horario. Preferencias de notificación post-MVP.

### Declaración de no-show

El donante puede marcar explícitamente "el receptor no se presentó" en el momento de cerrar o cancelar la sesión. Este acto registra un evento de no-show y aplica la penalización correspondiente al receptor. Si el donante no realiza ninguna declaración y el deadline expira, la sesión se cierra sin penalización para ninguna de las partes.

---

## 🌐 13. Descubrimiento Público (SEO)

### Acceso Híbrido (Modo Invitado)
El sistema permite el acceso de lectura a usuarios no autenticados para fomentar el descubrimiento de objetos y mejorar el posicionamiento en buscadores.

- **Feed Público (`/explorar`):** Visible sin login. Muestra todos los objetos activos sin restricción de radio geográfico (Feed Global).
- **Detalle de Objeto (`/items/:id`):** Visible sin login. Incluye imágenes, descripción y reputación del donante.
- **Privacidad del Donante (Invitados):** Para usuarios no autenticados, la información del donante es anónima (sin nombre real ni avatar). Solo se muestra el score de reputación.
- **Conversión Gating:** Cualquier intento de interacción (Solicitar, Reportar, Ver Perfil) redirige al flujo de login/registro.

### Estrategia SEO y Obsolescencia
- **Indexación:** Las páginas de objetos activos son indexables por bots.
- **Limpieza de Índice:** Los objetos en estado `completed` o `cancelled` se marcan para no ser indexados.
- **410 Gone:** El sistema devuelve `HTTP 410 Gone` para IDs de objetos que han sido eliminados permanentemente (purgados) del backend, indicando a los buscadores que deben eliminar la URL de sus índices.

---

## 🗺️ 14. Geocodificación

El código postal introducido en el registro se geocodifica para obtener las coordenadas geográficas del usuario. El proveedor debe seleccionarse antes de iniciar la Fase 3 de implementación. Criterios de selección: cobertura geográfica del mercado objetivo, coste por llamada y disponibilidad de fallback.

---

## ⚖️ 14. Equilibrio del ecosistema

- No obligatorio donar
- Pero recibir sin aportar reduce oportunidades progresivamente

El sistema regula acceso, no comportamiento.

---

## ⚠️ 15. Riesgos asumidos

- Multi-cuenta
- Uso oportunista
- Complejidad del sistema
- Curva de aprendizaje
- Dependencia del equilibrio dinámico
- Acoso o fraude fuera de la plataforma (fuera del alcance del sistema por diseño)
- Escalabilidad del ranking dinámico a gran volumen (mitigación diferida con umbral documentado)

---

## 🗺️ 16. Roadmap de implementación

| Fase | Nombre | Estado |
|---|---|---|
| 1 | Infraestructura base | 🔲 Pendiente |
| 2 | Modelo de datos | 🔲 Pendiente |
| 3 | Autenticación | 🔲 Pendiente |
| 4 | Flujo de objetos | 🔲 Pendiente |
| 5 | Ranking y reputación | 🔲 Pendiente |
| 6 | Sesión de entrega simplificada | 🔲 Pendiente |
| 7 | Perfil y reputación visible | 🔲 Pendiente |
| 8 | Calidad y lanzamiento | 🔲 Pendiente |

---

## 📦 17. Estado

Sistema MVP:

- Completo y coherente en su núcleo diferencial
- No bloqueante
- Basado en comportamiento
- Optimizado para equilibrio emergente
- Listo para iniciar implementación una vez resueltas las decisiones previas pendientes (proveedor de geocodificación, comportamiento de `expires_at` en `items`)
