# Deferred Work

_Issues identified during code review that were deferred due to scope, pre-existing architecture, or accepted risk._

---

## Deferred from: code review of spec-integrate-email-i18n-reports-admin (2026-06-14)

- **TPL-ADM-002: variables mismatch `entityType` vs `reportedEntityType`** — `create-report.use-case.ts:109` envía `{ entityType: dto.reportedEntityType }` pero el template lee `variables.reportedEntityType`; en producción el campo "Tipo de entidad" y el subject quedan vacíos siempre. El snapshot test enmascara el bug (usa la clave correcta del template). Preexistente. [create-report.use-case.ts:109, tpl-adm-002-new-report-admin.ts:20]
- **TPL-ADM-002: muestra clave raw del motivo en lugar de etiqueta legible** — el template imprime `fraude_o_enganio` en vez de "Fraude o engaño". `getReportReasonLabel()` no está siendo usado por ADM-002. Preexistente. [tpl-adm-002-new-report-admin.ts]
- **`reporter.email: null` silencia skip de TPL-012 sin log de warning** — en `admin-resolve-report.use-case.ts:84`, si el reporter existe pero `.email` es null (escenario RGPD: usuario anonimizado pero `reporter_id` permanece en `reports`), la resolución del email se omite silenciosamente sin log de warning ni auditoría del salto. Preexistente. [admin-resolve-report.use-case.ts:84]
- **Cast inseguro `string | null → AppPreferredLanguage`** — `(report.reporter.preferredLanguage ?? undefined) as AppPreferredLanguage | undefined` no valida en runtime; un valor de BD inesperado (ej. `'fr'`) pasa al template sin error, cayendo al fallback 'es' silenciosamente. Considerar guardia runtime con array `['es','ca','en'].includes(...)`. [admin-resolve-report.use-case.ts:94]
- **Guard `reporter.id !== null` es código muerto** — dentro del bloque `report.reporter !== null`, el repo garantiza que `.id` nunca es null (solo construye el objeto cuando `reporter_id` no es null en SQL). Reducción de ruido lógico. [admin-resolve-report.use-case.ts:84]
- **Audit log `email.attempted` se graba antes del envío async** — el log registra intento antes de que `mailService.send()` (fire-and-forget) complete; fallos asíncronos no quedan en el audit log. Patrón pre-existente en el proyecto. [admin-resolve-report.use-case.ts:85-109]

## Deferred from: code review of 14-6-resolucion-reportes-admin-post-endpoint (2026-06-11)

- Race condition: sin optimistic locking en el status check del reporte. Dos requests concurrentes pueden pasar la guarda `report.status !== 'pending'` antes de que alguna llegue a `update`. Pre-existing pattern en el proyecto; requeriría schema change (versión column) y coordinación con todas las historias.
- Sin transacción atómica entre cascade (cancel_item/suspend_user) y update del reporte. Si `reportRepo.update` falla tras el cascade exitoso, el item/usuario queda modificado pero el reporte en `pending`. Riesgo aceptado documentado en spec de 14-6.
- `req.ip` sin `trust proxy` registra IP del proxy no del admin real en audit log — pre-existing en todo el proyecto.
- Express body parser sin límite explícito de payload — pre-existing, afecta a todos los endpoints POST/PUT.

## Deferred from: code review of 14-7-extension-metricas-anonimizacion-analitica (2026-06-11)

- `ENTITY_STATE_CONFLICT` mensaje normalizado — cambio intencional, no es bug.
- Version bump inconsistente — documentado en notas del spec.
- Race condition en status check sin optimistic locking — pre-existing, requiere schema change.
- Estado inconsistente si cascade→update falla — riesgo aceptado documentado en spec.
- `req.ip` sin `trust proxy` logea IP del proxy — pre-existing en todo el proyecto.
- `archive` sin validación de entityType — intencional por diseño.
- Mock `adminSuspend` retorna `0` — detalle menor de test.
- Audit log falla silenciosa en try-catch — patrón pre-existente.
- `resolutionTimeHours` negativo por clock skew — edge case de bajo riesgo.
- Sin test `NotFoundException` en cascade — bajo riesgo.
- Sin test `archive` sobre reporte tipo `user` — bajo riesgo.

## Deferred from: code review of 14-7-extension-metricas-anonimizacion-analitica Round 2 (2026-06-11)

- Sin LIMIT en el UPDATE del job pg_cron de anonimización — en tablas con millones de filas podría generar locks prolongados; optimización pendiente para cuando el volumen lo justifique.
- `countMetrics()` en `Promise.all` sin fault isolation — un fallo en la query de reportes tiraría todo el endpoint de métricas; patrón pre-existente en toda la use-case, requiere refactor general.
- `resolved_at = NULL` excluido del conteo 30 días — NULL comparison en SQL retorna NULL; el schema probablemente garantiza non-null para estados resolved/archived, riesgo teórico.
- pg_cron sin monitoring/alerting para el job de anonimización — ejecuciones fallidas no alertan; considerar en una historia de observabilidad futura.
- Migración falla si pg_cron no está instalado en el entorno — mismo patrón que migración 011; aceptado como riesgo de entorno de desarrollo.
## Deferred from: code review of 13-1-infraestructura-seo-y-endpoints-publicos (2026-06-15)

- **Race condition en paginación guest — COUNT y SELECT sin transacción** — `Promise.all([COUNT, SELECT])` en la rama guest de `findActiveInRadius` puede producir divergencia entre total e ítems bajo escrituras concurrentes. Pre-existente en la rama autenticada desde historia 2-2. [src/infrastructure/database/supabase/item.repository.ts]
- **buildTestApp sobre-comparte estado de mocks** — overrides parciales de `itemRepo` reemplazan el objeto completo; métodos no declarados quedan undefined y pueden causar fallas en rutas que los tocan. Patrón pre-existente en todos los test files del proyecto.
- **Header `Authorization: bearer` (minúsculas) degrada silenciosamente a guest** — `startsWith('Bearer ')` es case-sensitive; un token válido con 'b' minúscula no es detectado y el usuario es servido como invitado. Pre-existente en `createAuthMiddleware` y `createOptionalAuthMiddleware`. [src/interfaces/http/middlewares/auth.middleware.ts]
- **page=0 → SQL OFFSET negativo en findActiveInRadius** — `(input.page - 1) * input.limit` produce OFFSET negativo si `page=0`; la Zod validator HTTP lo previene, pero llamadas internas no tienen guard defensivo. Pre-existente (offset calculation moved, not introduced). [src/infrastructure/database/supabase/item.repository.ts]

## Deferred from: code review of spec-email-language-localization (2026-06-14)

- **Sin logging cuando locale es desconocido y hace fallback a 'es'** — `footerT`, `layoutT` y los `t()` por template silencian el fallback sin log ni métrica. Mejora de observabilidad; no introduce bugs. [src/infrastructure/email/templates/layout/email-layout.ts, todos los tpl-*.ts]
- **`preferred_language` podría ser NULL en BD para usuarios registrados antes del CHECK constraint** — Los interfaces TS declaran `donorPreferredLanguage: string` sin `| null`; el runtime funciona correctamente gracias a `?? 'es'`, pero el type mismatch es impreciso. [src/domain/repositories/delivery-session.repository.ts, src/domain/repositories/item.repository.ts]
- **`formatDeadlineAt` en TPL-003 no localiza el formato de fecha** — Fechas siempre se muestran como `YYYY-MM-DD HH:mm` ISO independiente del locale. Preexistente; registrado anteriormente en el deferred de `spec-email-fixes-tpl-003-tpl-006`. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **TRANSLATIONS no tipadas contra `AppPreferredLanguage`** — Cada template usa `type Locale = keyof typeof TRANSLATIONS` local; si se añade un locale al schema sin actualizar un template, no hay error TypeScript. Considerar `type Locale = AppPreferredLanguage` en todos los templates. [src/infrastructure/email/templates/tpl-*.ts]
- **TPL-010 puede enviar digest con 0 ítems** — `parseDigestItems` retorna `[]` si `itemsJson` es inválido o vacío; el email se envía con "Hay 0 objetos nuevos disponibles". Comportamiento preexistente al i18n. [src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts]

## Deferred from: code review of 12-2-api-postulacion-seleccion-sesion-candidato (2026-05-31)

- **`revealSharedContactChannel` gatea en `session.contactChannel !== null`** — si el canal es NULL (datos legacy), el donante no ve `sharedContactChannel` aunque la sesión esté activa y no purgada. Comportamiento pre-existente de SEC-002b, no introducido en este diff. [src/application/use-cases/delivery-session/get-delivery-session.use-case.ts]

- **AC-4: filas `item_requests` en estado `rejected` de ciclos previos no se purgan en `selectReceiver`** — el UPDATE solo afecta `status = 'pending'`. Teórico: en el flujo normal, los rechazos anteriores ya tienen `contact_channel = NULL` de su propio `selectReceiver`. [src/infrastructure/database/supabase/delivery-session.repository.ts]

- **Sin test que verifique ausencia de `contactChannel` en respuesta de candidatos rankeados (AC-3)** — la SQL de `findRankedCandidates` no selecciona ese campo pero no hay test de no-presencia. Gap de cobertura pre-existente.

## Deferred from: code review of 12-1-schema-y-jobs-purga-canal-candidato (2026-05-31)

- **`completed_at IS NULL` no filtrado en job de purga** — sesiones `expired` con `completed_at NULL` nunca entran en el WHERE del job `purge-contact-channel`; la migración 018 replica la misma deuda de la migración 011 (historia 4.6), documentada y diferida explícitamente. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql]

- **DROP/CREATE INDEX sin CONCURRENTLY** — `DROP INDEX IF EXISTS` y `CREATE INDEX` toman lock exclusivo en `delivery_sessions` durante la migración; en producción activa puede bloquear lecturas brevemente. Evaluar ventana de mantenimiento antes de ejecutar en prod con tráfico. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql]

- **Migración sin wrapper transaccional explícito** — si `SELECT cron.schedule(...)` falla (pg_cron no instalado o error), los DDL ya aplicados no se revertirán si el migration runner no envuelve en transacción. Patrón pre-existente en el proyecto (migraciones 001–017). [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql]

## Deferred from: code review of 11-3-ranking-tier-acaparador-sql (2026-05-31)

- **Riesgo latente de inyección SQL por patrón template literal** — fragmentos SQL estáticos exportados sin entrada de usuario; sin vector activo hoy, pero el patrón template literal no tiene barrera estructural para futuros cambios. Pre-existente en todo el proyecto. [src/infrastructure/database/sql/ranked-candidate-filters.ts]

- **Riesgo de double-negation en composición futura de `RANKED_ELIGIBLE_REQUESTER_SQL`** — `NOT (NOT FR17 AND NOT Tier2)` si se niega externamente produce `FR17 OR Tier2`; correcto pero no obvio. Teórico, no causado por este diff. [src/infrastructure/database/sql/ranked-candidate-filters.ts]

- **Falta índice en `(cycles_at_limit, total_donated)` para subquery `pending_count`** — la subquery filtra por estas columnas en la tabla users sin índice compuesto; rendimiento pre-existente, no introducido por este diff. [src/infrastructure/database/supabase/user.repository.ts:420]

## Deferred from: code review of 11-5-sincronizar-documentacion-ranking (2026-05-29)

- **prd.md §9 no menciona exclusión Tier 2 acaparador** — §9 Propiedades solo dice «Excluye usuarios pasivos»; RFC-003 Tier 2 no está en spec §14 (solo §10–11). Sprint-change-proposal lo mencionaba opcionalmente. [docs/prd.md:163]

- **Cabecera architecture.md sin nota Correct Course ranking v1.0** — Contenido §3.6, §5–6, §12 actualizado pero versión sigue en 1.6 (digest). Story permitía nota opcional en cabecera. [docs/architecture.md:1-8]

- **Ventana timing Job 4 pg_cron vs rehabilitación instantánea post-donación** — Usuario que dona puede ver `cycles_at_limit` incrementado por cron antes de próxima consulta; edge case raro no documentado. [docs/prd.md:224]

## Deferred from: code review of 11-2-reputacion-asimetrica-confirm-cancel (2026-05-29)

- **RETURNING vacío en UPDATE donante/receptor** — Patrón pre-existente sin guard en `rows[0]`; IDs vienen de sesión validada. [src/infrastructure/database/supabase/delivery-session.repository.ts:171-210]

- **`total_donated` negativo en BD corrupta** — Condición RFC-004 usa `=== 0` estricto; schema asume contador no negativo. [src/infrastructure/database/supabase/delivery-session.repository.ts:168]

- **Overflow entero en penalización no-show extrema** — `-10 * consecutive_no_shows` sin tope; escenario irreal en MVP. [src/infrastructure/database/supabase/delivery-session.repository.ts:297]

- **AE-030 HTTP sin deltas escalados (-20/-30)** — `delivery-sessions-cancel.test.ts` solo asserta primer no-show `-10`; cobertura n>1 planificada en historia 11.4. [tests/delivery-sessions-cancel.test.ts]

- **Unitarios no inspeccionan SQL `consecutive_no_shows = 0`** — Reset presente en SQL de producción (L174, L184) pero no verificado en mocks unitarios. [tests/delivery-session-reputation-role.test.ts]

- **Round-trip SQL extra por confirm** — `SELECT total_donated` antes del UPDATE donante; coste aceptado y requerido por RFC-004. [src/infrastructure/database/supabase/delivery-session.repository.ts:163-168]

## Deferred from: code review of 11-1-migracion-role-reputation-events (2026-05-29)

- **Verificar `npm run db:migrate` antes de merge/prod** — AC #1 no verificado en runtime; Dev Record documenta ECONNREFUSED sin Postgres local. Aplicar migración 017 en CI o entorno con BD antes de cerrar la historia.

- **`ADD COLUMN IF NOT EXISTS` no repara columna `role` sin CHECK** — Si un deploy fallido dejó la columna sin constraint, la migración 017 no lo corrige. Escenario raro; considerar `ADD CONSTRAINT ... NOT VALID` en hardening futuro. [src/infrastructure/database/supabase/migrations/017-reputation-events-role.sql:3-5]

## Deferred from: code review of fix-digest-remove-time-window (2026-06-06)

- **N+1 amplificado sin ventana temporal** — Sin `created_at >= NOW() - INTERVAL '1 hour'`, el primer run post-deploy puede reclamar todos los objetos históricos y ejecutar `findEligibleDigestUsersForItem` por cada uno. Ya diferido como N+1 MVP; reevaluar prioridad si el volumen crece. [src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts]

- **Cron retries concurrentes reportan `processedItems: 0` silenciosamente** — Si el cron externo reintenta mientras la primera ejecución aún corre (possible en run grande), el segundo UPDATE...RETURNING devuelve 0 filas (correcto por diseño de idempotencia). No se duplican emails, pero la observabilidad en cron-job.org muestra "0 procesados" como si hubiera fallado. Evaluar `pg_try_advisory_lock` si esto genera falsos alertas. [src/infrastructure/database/supabase/item.repository.ts]

## Deferred from: code review of 10-1-digest-horario-objetos-cercanos-email (2026-05-29)

- **Consulta N+1 por item pendiente en digest** — MVP acepta `claimPendingDigestItems` + `findEligibleDigestUsersForItem` por item; refactor a SQL agrupado único en backlog si el volumen lo exige. Decisión producto opción B (2026-05-29). [src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts]

## Deferred from: code review of spec-email-fixes-tpl-003-tpl-006 (2026-05-27)

- **`formatDeadlineAt` muestra hora UTC sin indicador de zona horaria** — `2026-02-01 12:00` es UTC pero no tiene label; confuso para usuarios en zonas distintas. Formato explícito pedido por usuario en spec; product decision si agregar " UTC" o convertir a zona del receptor. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`formatDeadlineAt` sin guard para string vacío o corto** — `''.slice(0,16)` devuelve `''` silenciosamente; no alcanzable desde callers actuales (siempre `.toISOString()`). [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`CONDITION_LABELS` tipado como `Record<string, string>` en vez de `Record<ItemCondition, string>`** — sin riesgo práctico (4 valores cubiertos), pero un nuevo valor de enum no fallaría en compilación. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`CONDITION_LABELS` en template en vez de capa compartida** — conocimiento de dominio colocado en capa de infraestructura; debería estar en capa de presentación/i18n compartida. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`formatDeadlineAt` no exportada para testing aislado** — función pura solo testeable a través del template completo. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`APP_PUBLIC_URL` con path segments preserva prefijo en CTA URL** — `replace(/\/$/, '')` solo quita trailing slash; si la URL tiene path (`https://example.com/app/`), el resultado es `https://example.com/app/items/:id`. Convención de uso estándar no afectada. [src/infrastructure/email/templates/tpl-006-new-request.ts]
- **`APP_PUBLIC_URL` sin validación de formato URL** — `env.ts` valida presencia pero no formato; un valor malformado produce CTA href inválido. Pre-existente en todos los templates. [src/config/env.ts]
- **Assertion fire-and-forget en `items-request.test.ts` test 13.1 depende de timing de microtasks** — `void promise.then(mailService.send)` sin await; el test 13.1 aserta en `mailService.send` que puede no haberse llamado aún en runtimes lentos. Patrón pre-existente en el proyecto. [tests/items-request.test.ts]

## Deferred from: code review of email-fixes-tpl-003-tpl-006 (2026-05-27)

- **`formatDeadlineAt` asume formato ISO Z sin validación** — `iso.slice(0,16).replace('T',' ')` funciona correctamente solo con strings `YYYY-MM-DDTHH:mm:ss.sssZ` (output de `.toISOString()`). Un string vacío o no-ISO renderiza un deadline en blanco o truncado. No es un riesgo en el call path actual (único caller siempre pasa `.toISOString()`), pero la función no está guarded para uso general. [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`CONDITION_LABELS` fallback con condición desconocida/vacía** — `CONDITION_LABELS[itemCondition] ?? itemCondition` devuelve el raw value si el enum no matchea, resultando en "(estado: )" con string vacío. No es un riesgo en el call path actual (valor viene de enum de DB). [src/infrastructure/email/templates/tpl-003-receiver-selected.ts]
- **`recipientEmail` en variables de TPL-006 no utilizado** — la variable se pasa en el use-case pero `renderTpl006` no la consume. Copy-paste de patrón pre-existente en todos los templates del proyecto. [src/application/use-cases/item/request-item.use-case.ts]
- **TPL-006 sin contexto del objeto (resuelto)** — ítem diferido desde code review de 3-1 (2026-05-08); el deep link `/items/:itemId` fue implementado en esta historia.

## Deferred from: code review of 9-3-tier-2-tpl-003-004-005-006 (2026-05-27)

- **`bodyHtml` inyectado sin escapar en `renderEmailLayout`** — seguro hoy porque todos los callers usan `renderEmailParagraph`, pero es trampa latente para futuros callers que construyan HTML sin el helper. [src/infrastructure/email/templates/layout/email-layout.ts]
- **Entradas legacy TPL-003-006 duplicadas en mapa `templates` con subjects divergentes** — intencional por dev notes (legacy permanece hasta 9.5); TPL-003 legacy tiene subject "¡Has sido seleccionado como receptor!" vs nuevo "¡Fuiste seleccionado/a como receptor!". Limpieza en historia 9.5. [src/infrastructure/email/resend.provider.ts]
- **UUID `itemId` expuesto en cuerpo de TPL-004** — information disclosure de identificador interno; comportamiento heredado del legacy template. [src/infrastructure/email/templates/tpl-004-session-expired.ts:10]
- **`firstName` vacío renderiza "Hola, " con coma sin nombre** — todos los templates usan `''` como fallback; si `firstName` es null/vacío el saludo queda mal formado. Patrón pre-existente en todo el proyecto.
- **`donorReputationScore = 0` cuando lookup de donante falla** — en `SelectReceiverUseCase`, `donor?.reputationScore ?? 0` pasa `0` si `donor` es null; el receptor ve score `0` que parece legítimo pero indica fallo de lookup. Fuera de scope de 9.3. [src/application/use-cases/item/select-receiver.use-case.ts]
- **`deadlineAt.toISOString()` lanza TypeError si DB retorna null** — en `expire-delivery-sessions.use-case.ts`, el throw ocurre antes de llegar al template; el `.catch` solo loguea y el email no se envía sin alerta. Pre-existente. [src/application/use-cases/delivery-session/expire-delivery-sessions.use-case.ts]
- **Footer auth "¿No creaste esta cuenta?" en emails transaccionales** — copy semánticamente incorrecto en TPL-003-006 (usuario ya tiene cuenta y la está usando activamente). Diseño heredado del layout compartido; concern de UX/copy para revisión futura.
- **Legacy XSS en `templates` para TPL-001/TPL-007** — los dos IDs sin tiered path interpolan datos de usuario directamente en HTML sin `escapeHtml()`. Pre-existente; TPL-007 será migrado en 9.4. [src/infrastructure/email/resend.provider.ts]

## Deferred from: code review of 9-2-tier-1-tpl-009-002-008 (2026-05-27)

- **Entradas legacy TPL-002/008/009 en mapa `templates` (dead code)** — `ResendMailProvider` registra los tres IDs en `tieredTemplates` Y en `templates`; el tiered path retorna primero y las entradas legacy nunca se alcanzan. Limpieza programada para historia 9.5. [src/infrastructure/email/resend.provider.ts]
- **`forgot-password.use-case.ts` usa `CORS_ORIGIN` en lugar de `APP_PUBLIC_URL` para `resetLink`** — los otros use-cases (register, resend-verification) usan `APP_PUBLIC_URL` correctamente. En producción si ambas env vars difieren, el link de reset apunta al origen incorrecto. Pre-existing desde épica 1. [src/application/use-cases/auth/forgot-password.use-case.ts:29]
- **Sin manejo de errores en `resend.emails.send()`** — errores de red, 4xx/5xx de Resend, o dirección inválida propagan como rejection no tipada al caller. Pre-existing en el provider. [src/infrastructure/email/resend.provider.ts]
- **`templateId` desconocido envía HTML de debug al usuario** — si `payload.templateId` no matchea ni `tieredTemplates` ni `templates`, se envía email con `<p>Template X not found.</p>` al usuario real. Pre-existing behavior. [src/infrastructure/email/resend.provider.ts:99]
- **Singleton `resend` instanciado en module load con `RESEND_API_KEY`** — si la key está ausente (entorno de test sin mock), el cliente se crea con key inválida. Pre-existing. [src/infrastructure/email/resend.provider.ts:8]

## Deferred from: code review of 9-1-layout-shell-y-tokens-email (2026-05-27)

- **Trust boundary de `bodyHtml` no documentada** — `bodyHtml: string` acepta HTML crudo sin branded type ni contrato explícito. Opciones: JSDoc comment o `TrustedHtml` branded type. [src/infrastructure/email/templates/layout/email-layout.ts]
- **Token `accent` definido pero sin uso** — `tokens.accent` exportado con valor correcto pero ningún componente lo referencia. Riesgo de drift si el color cambia. [src/infrastructure/email/tokens/email-design-tokens.ts:6]
- **`renderEmailParagraph` no es llamado por el layout (API inconsistente)** — el layout delega heading/button/footer pero no paragraph; el caller debe llamar `renderEmailParagraph` externamente y pasar el resultado como `bodyHtml`. Inconsistencia de diseño sin impacto en 9.1. [src/infrastructure/email/templates/index.ts]
- **`renderEmailHeading` siempre emite `<h1>`** — sin argumento de nivel; templates multi-sección futuras necesitarán fork o HTML inline. [src/infrastructure/email/templates/components/email-heading.ts:4]
- **Acoplamiento estrecho entre layout y componentes** — `renderEmailLayout` importa directamente button/heading/footer; sin punto de inyección para variantes. Concern de extensibilidad futura. [src/infrastructure/email/templates/layout/email-layout.ts:2-4]
- **Sin tests para campos requeridos vacíos o solo-whitespace** — `preheader`, `firstName`, `title`, `bodyHtml` con `''` no están cubiertos. TypeScript garantiza el tipo pero no el valor. [tests/email-layout.test.ts]
- **`cta.label`/`cta.href` vacíos no guardados** — botón con `label: ''` renderiza invisible; `href: ''` enlaza a la página actual. Sin validación en runtime. [src/infrastructure/email/templates/layout/email-layout.ts]

## Deferred from: code review of 8-6-plantilla-tpl-009-y-email-flow (2026-05-26)

- **GET token en query string expuesto en logs** — el token de verificación viaja en la URL de `GET /auth/verify-email`, quedando registrado en logs de proxy/CDN/browser. Diseño establecido en 8.4; cambio requeriría rediseño del endpoint a POST. [src/interfaces/http/routes/auth.routes.ts]
- **`verifyEmailQuerySchema` sin validación de formato/charset** — `z.string().min(1).max(256)` sin regex de charset (ej. hex 64 chars). No requerido por spec; un regex eliminaría entradas malformadas antes del DB lookup. [src/openapi/schemas/auth.schemas.ts:50]
- **`GET /auth/verify-email` sin respuesta 404 en OpenAPI** — implementación retorna 400 para todos los errores de token (no encontrado, expirado, ya usado). OpenAPI solo documenta 400. Spec no requiere 404; consistente con la implementación. [src/openapi/register-paths.ts]
- **`mailService.send` failure en resend fire-and-forget sin test** — si `mailService.send` rechaza, el token ya fue rotado en DB pero el usuario no recibe email; cooldown de 30s previene reintento inmediato. Comportamiento fire-and-forget intencional, no en AC#5. [tests]
- **Race condition doble-clic en verify-email sin test** — dos requests concurrentes con el mismo token pasan la guardia `expiresAt`; el segundo llega a `markEmailVerified` con `rowCount=0` → 400. No requerido por AC#5. [tests]
- **Usuario ya verificado indistinguible de token inválido** — `findByVerificationTokenHash` filtra `email_verified=FALSE`; re-verificación retorna mismo 400 que token inválido. Diseño de 8.4; no distinguible en UX. [src/application/use-cases/user/verify-email.use-case.ts]
- **Sin rate-limiting en `GET /auth/verify-email`** — sin guardia de tasa, un atacante puede enumerar hashes SHA-256 contra DB. Preocupación arquitectónica pre-existente. [src]
- **Header `Retry-After` no declarado en campo `headers` del schema OpenAPI del 429** — descripción del 429 menciona el header pero no está en el campo `headers` del response schema. No requerido por spec; documentación incompleta para clientes OpenAPI strict. [src/openapi/register-paths.ts]
- **Cooldown constant no compartida entre implementación y tests** — `verificationResendAt: new Date(Date.now() - 5_000)` asume cooldown de 30s sin importar la constante real. Si el cooldown cambia, el test puede pasar incorrectamente. [tests/auth-email-verification-flow.test.ts:165]

## Deferred from: code review of 8-5-post-auth-resend-verification (2026-05-26)

- **Race condition: requests concurrentes pueden pasar cooldown** — sin `UPDATE ... WHERE verification_resend_at IS NULL OR verification_resend_at < NOW() - 30s` atómico, dos requests simultáneos pueden pasar el check y generar dos tokens/emails. Patrón pre-existente en el codebase (otros use-cases tampoco usan atomic update). [src/application/use-cases/user/resend-verification.use-case.ts]
- **`req.currentUser!` non-null assertion sin guard de runtime** — si el middleware es reordenado o removido, lanza TypeError en lugar de UnauthorizedException. Patrón pre-existente en todos los controladores del proyecto. [src/interfaces/http/controllers/auth.controller.ts]
- **`updateVerificationToken` no verifica `rowCount`** — si el usuario es borrado entre `findById` y `updateVerificationToken`, el UPDATE retorna 0 rows afectadas silenciosamente y el use-case retorna 200 sin haber persistido token ni enviado email. Patrón pre-existente (similar al hallazgo en 1-5). [src/infrastructure/database/supabase/user.repository.ts]

## Deferred from: code review of 8-4-get-auth-verify-email (2026-05-26)

- **Validator no rechaza token malformado (no-hex, ≠64 chars)** — `verifyEmailQuerySchema` solo impone `min(1).max(256)`; un token con formato inválido pasa al use-case y retorna 400 via hash-mismatch (comportamiento correcto, distinta capa). Aceptado para MVP. [src/interfaces/validators/verify-email.validator.ts:4]
- **`buildTestApp` shallow-merge de `userRepo`** — Tests que pasan override completo de `userRepo` reemplazan el objeto entero; si `IUserRepository` gana métodos futuros, los tests de override rompen en TypeScript solo si se agrega el método al mock. Patrón pre-existente en todas las suites. [tests/auth-verify-email.test.ts:113]
- **Mensaje de éxito hardcodeado en español testeado como literal** — `'Email verificado correctamente'` en use-case y aserción de test son la misma constante; si se introduce i18n en el futuro, el test rompe. Patrón pre-existente en toda la codebase. [src/application/use-cases/user/verify-email.use-case.ts:26]

## Deferred from: code review of 7-7-persistencia-eventos-analytics-postgres (2026-05-26)

- **Smoke manual post-deploy sin ejecutar** — Task 6 deja sin verificar `SELECT * FROM analytics_events` tras AE-002 en entorno con migración 014. Checklist pre-lanzamiento manual.
- **Inserts pendientes en `setImmediate` pueden perderse en shutdown** — Al apagar el proceso, eventos encolados en el siguiente tick no se persisten. Aceptado para MVP dual-write fire-and-forget (SC-07 prioriza no bloquear negocio).

## Deferred from: code review of 7-6-instrumentacion-entrega-y-reputacion (2026-05-25)

- **Mock `safeEmitEvent` duplicado en 3 ficheros de test** — Cada test file reimplementa el wrapper de `safeEmitEvent` sobre `mockEmitEvent`. Patrón idéntico al aceptado en CR 7-5; refactor a helper compartido queda fuera de scope. [tests/delivery-sessions-confirm.test.ts, tests/delivery-sessions-cancel.test.ts, tests/expire-delivery-sessions.test.ts]

## Deferred from: code review of 7-5-instrumentacion-objetos-y-solicitudes (2026-05-25)

- **`hadActiveSession` predeterminado a `false` cuando `hasActiveDeliverySession` falla** — Si la consulta a BD falla, AE-014 se emite con `hadActiveSession: false` aunque el valor real sea desconocido. Trade-off aceptado: analytics nunca bloquea negocio; el fallo es silenciado con `logger.warn`. [src/application/use-cases/item/cancel-item.use-case.ts:22-27]
- **Race condition en `candidateCount`** — Entre `findRankedCandidates` y `selectReceiver` pueden llegar nuevas solicitudes, haciendo que `candidateCount` sea potencialmente bajo por 1+. Reconocido y aceptado en la spec ("inmediatamente antes de la transacción"). [src/application/use-cases/item/select-receiver.use-case.ts:31]
- **Query DB extra por selección para `candidateCount`** — `SelectReceiverUseCase` ahora emite 3 queries (findItemOwnership + findRankedCandidates + selectReceiver). El coste es aceptado por requerimiento analítico; sin alternativa sin cambio arquitectónico. [src/application/use-cases/item/select-receiver.use-case.ts:31]

## Deferred from: code review of 7-4-instrumentacion-autenticacion-ae-001-ae-002 (2026-05-25)

- **Test 10.3 pre-existente no aserta `emitEvent` ausencia en geocode rejection** — el nuevo test 10.15 cubre el path equivalente (geocode→null→400). El path de rejection (10.3) también previene el emit por posición del código, pero sin aserción explícita. Pre-existente, out-of-scope 7.4. [tests/auth-register.test.ts]
- **`emitEvent` en analytics.service.ts sin try/catch interno** — si `analyticsLogger.info()` lanzara (e.g., stream cerrado), la excepción propagaría al use case y el error handler respondería 500 tras un commit exitoso. Pino no lanza en uso normal, pero la protección defensiva debería estar en `analytics.service.ts`. Scope story 7.2. [src/application/services/analytics.service.ts]

## Deferred from: code review of 7-3-api-publicar-item-category-weight-range (2026-05-25)

- **Tests 8.6 y 8.16 idénticos** — ambos prueban geocode null → emitEvent no llamado. Preexistente y harmless; 8.6 fue modificado para incluir el assert y 8.16 fue agregado como test dedicado. [tests/items-publish.test.ts]
- **`emitEvent` sin try/catch protector** — si `analyticsLogger.info` lanzara sincrónicamente, propagaría como 500 después de un commit exitoso. Spec prohíbe explícitamente el try/catch; pino no lanza en uso normal. [src/application/use-cases/item/publish-item.use-case.ts:49]
- **Type assertions en mapRow sin validación runtime** — `row.category as ItemCategory` y `row.weight_range as ItemWeightRange` son casts inseguros. Patrón preexistente en todo el repo para condition/status. Riesgo: migración desalineada no se detecta en runtime. [src/infrastructure/database/supabase/item.repository.ts:373-374]

## Deferred from: code review of 7-2-loggers-y-analytics-service (2026-05-25)

- **`vi.restoreAllMocks()` en `afterEach` redundante para mocks hoisted** — el `afterEach` del describe `analytics.service — emitEvent` llama `vi.restoreAllMocks()`, que restaura spies pero no tiene efecto sobre mocks creados con `vi.fn()` + `vi.hoisted`. Patrón pre-existente en el proyecto. 243/243 tests OK. [tests/analytics-service.test.ts:23-25]

## Deferred from: code review of 7-1-migracion-sql-y-dominio-items-dlt-004 (2026-05-25)

- **Enum values duplicados entre SQL CHECK y TypeScript union types** — `ItemCategory` y `ItemWeightRange` en `item.entity.ts` duplican los valores del CHECK constraint en `013-items-dlt-004.sql`. Patrón pre-existente en el proyecto (mismo enfoque para `ItemCondition`, `ItemStatus`). Riesgo: si se agrega un valor nuevo solo en TS sin actualizar el CHECK, la BD rechazará INSERTs. Historia 7.3 deberá alinear ambas definiciones cuando amplíe validadores Zod. [src/domain/entities/item.entity.ts + src/infrastructure/database/supabase/migrations/013-items-dlt-004.sql]

## Deferred from: code review of 6-5-emails-saludo-personalizado-firstname (2026-05-25)

- **`expiresInMinutes` no interpolado en TPL-002 HTML** — La variable se envía en `variables` (alineado con email-flow-mapping EVT-002) pero el HTML de TPL-002 hardcodea "El enlace expira en 1 hora." en lugar de usar `${v.expiresInMinutes}`. Si el TTL del token cambia, el HTML quedaría desactualizado. No viola ningún AC de la historia. [src/infrastructure/email/resend.provider.ts]

## Deferred from: code review of 1-1-inicializacion-del-proyecto-e-infraestructura-base (2026-05-04)

- **Sin handler de cierre graceful** — No hay listeners para SIGTERM/SIGINT, no se llama `server.close()` ni `db.end()` antes de terminar el proceso. Relevante para Railway/contenedores.
- **Dos instancias pino independientes** — `app.ts` crea una instancia via `pinoHttp` y `main.ts` crea otra separada. Deberían compartir un logger raíz para consistencia de destino y serializers.
- **Rate limiting en memoria por instancia** — `express-rate-limit` usa MemoryStore por defecto. En multi-instancia (escaling horizontal) los contadores se resetean por instancia. Migrar a RedisStore cuando se escale.
- **LOG_LEVEL sin validar** — El valor de `process.env.LOG_LEVEL` se pasa directo a pino sin verificar que sea un nivel válido (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`).
- **package.json sin campo "engines"** — No declara la versión mínima de Node.js requerida (≥20 LTS). Puede producir fallos silenciosos en runtimes más viejos.
- **`tests/` excluido de tsconfig.json** — Errores de tipo en tests no detectados por `tsc --noEmit`. Fix requiere cambiar `rootDir` a `.` y actualizar el script `start` a `node dist/src/main.js`. Decisión arquitectónica.
- **package.json sin `"type": "module"`** — Para operar en modo ESM nativo, todos los imports relativos necesitan extensión `.js`. Migración amplia requerida. Decidir si el proyecto es ESM o CJS antes de abordar.

## Deferred from: code review of 1-2-registro-de-usuario (2026-05-05)

- **authRouter module-level instantiation** — `export const authRouter = createAuthRouter()` ejecuta dependencias de producción al importar el módulo. Patrón Express estándar; los tests ya están aislados via `createAuthRouter(deps)`. Evaluar en el futuro si se introduce un contenedor IoC. [src/interfaces/http/routes/auth.routes.ts:57]
- **JwtService.verify sin mapeo de excepciones** — `jwt.verify()` lanza `JsonWebTokenError` / `TokenExpiredError` que no están mapeadas a HTTP 401 en el error handler. `verify()` no se usa en esta historia; se resuelve en historia 1.4 cuando se implemente el middleware de autenticación. [src/infrastructure/security/jwt.service.ts:10-12]

## Deferred from: code review of 1-4-middleware-de-autenticacion-con-validacion-de-jwt-version (2026-05-05)

- **Helper `buildTestApp` reemplaza objeto completo de dependencias en override** — pasar solo una propiedad de `userRepo` descarta las demás. Fragile para futuros tests. [tests/auth-middleware.test.ts:27]
- **Posible type mismatch en campos `Date` del driver pg** — `lastCycleIncrementedAt` y `lastActiveAt` podrían llegar como string si pg no parsea el tipo. Pre-existente en todo el repositorio. [src/infrastructure/database/supabase/user.repository.ts]
- **`findById` duplica anotación de tipo inline** — misma anotación que `findByEmail`, no se extrae a un tipo compartido. Patrón pre-existente en el repositorio. [src/infrastructure/database/supabase/user.repository.ts]

## Deferred from: code review of 1-3-login-de-usuario (2026-05-05)

- **UnauthorizedException sin Object.setPrototypeOf** — Pre-existente en todas las excepciones del proyecto. Afecta entornos ES5/transpilados donde `instanceof` falla en subclases de Error sin el fix. Si el target de TS cambia a ES5, todas las excepciones deben ser corregidas en lote.
- **Errores de red en reCAPTCHA service no manejados específicamente** — Un fallo del servicio externo devuelve 500 genérico. Podría mejorarse con una excepción específica (`ServiceUnavailableException`) y un retry/circuit breaker, pero requiere decisión de arquitectura.
- **Logger instanciado por módulo en vez de singleton** — Cada use case crea su propio `pino()`. Patrón pre-existente. Para homogeneizar logs (nivel, transporte, contexto request-id), se debería inyectar el logger como dependencia vía DI.
- **Sin test para fallo de reCAPTCHA service (error de red)** — Caso de borde de servicio externo no cubierto. Comportamiento actual: burbujea como 500. Debería especificarse y testarse el manejo de fallos externos.
- **Sin test para fallo de jwtService.sign** — Un error en la firma JWT (clave ausente, algoritmo inválido) no está cubierto. Comportamiento esperado (500 vs error específico) no está definido ni verificado.

## Deferred from: code review of 2-1-publicar-objeto-con-imagenes (2026-05-06)

- **Storage orphans en fallo de upload mid-loop** — Si `storageService.upload` falla en el archivo K (K>1), los archivos 0…K-1 ya subidos quedan huérfanos en Storage sin cleanup. Aceptado explícitamente para MVP por spec. [src/application/use-cases/item/publish-item.use-case.ts:28]
- **`condition` sin CHECK constraint en DB** — La columna `condition TEXT NOT NULL` no tiene `CHECK (condition IN (...))`. Validación delegada a Zod en capa de aplicación por diseño. [src/infrastructure/database/supabase/migrations/003-create-items.sql:6]
- **`item_images` sin ON DELETE CASCADE** — Referencia a `items(id)` sin cascade; eliminar un item fallará con FK violation si tiene imágenes. Eliminación de items fuera de scope actual. [src/infrastructure/database/supabase/migrations/004-create-item-images-and-storage-queue.sql]
- **Tipo MIME validado por Content-Type (no magic bytes)** — Un cliente puede enviar cualquier archivo con MIME falso. Hardening de seguridad fuera de scope MVP. [src/interfaces/http/routes/items.routes.ts:31]
- **`upsert: false` en Storage no idempotente** — Reintento de un upload que ya fue procesado recibe error "already exists" → 500. Requiere diseño de idempotency keys. [src/infrastructure/storage/supabase-storage.adapter.ts:11]
- **Nominatim sin rate-limiting** — Un 429 de la API pública resulta en `GeocodingException` para el usuario. Concern pre-existente; afecta también el flujo de registro. [src/infrastructure/geocoding/nominatim.adapter.ts]
- **INSERTs de `item_images` secuenciales dentro de transacción** — N round-trips al DB por cada imagen mientras se mantiene el cliente de pool. Para MVP (máx. 5 imágenes) es aceptable; batch INSERT sería más eficiente. [src/infrastructure/database/supabase/item.repository.ts:34]
- **`multer limits.files:5` no es por campo** — El límite cuenta archivos de todos los campos del form, no solo `images`. Un cliente puede enviar archivos extra en otros campos, consumiendo memoria innecesaria antes de descartarlos. [src/interfaces/http/routes/items.routes.ts:29]
- **Todos los buffers de archivos en heap simultáneamente** — Con 5 archivos × 2 MB = hasta 10 MB por request en heap hasta completar todos los uploads. Inherente al diseño memoryStorage. [src/application/use-cases/item/publish-item.use-case.ts:28]
- **`SupabaseStorageAdapter` crea cliente Supabase completo** — `createClient()` inicializa subsistemas de realtime (WebSockets) aunque solo se use Storage. Genera handles abiertos innecesarios. [src/infrastructure/storage/supabase-storage.adapter.ts:6]
- **`req.currentUser!` non-null assertion sin guard** — Si el authMiddleware es removido o reordenado, lanza `TypeError` en lugar de `UnauthorizedException`. Patrón pre-existente en el codebase. [src/interfaces/http/controllers/item.controller.ts:11]
- **`upload` multer a nivel de módulo** — No puede ser sobreescrito via `deps` en `createItemRouter()`. No impacta tests actuales. [src/interfaces/http/routes/items.routes.ts:28]

## Deferred from: code review of 2-2-listar-objetos-disponibles-en-radio-geografico (2026-05-06)

- **Promise.all — count y list pueden divergir bajo escrituras concurrentes** — Dos queries separadas sin transacción; entre COUNT y SELECT puede cambiar el dataset. Fix: window function `COUNT(*) OVER ()` o `REPEATABLE READ`. [src/infrastructure/database/supabase/item.repository.ts]
- **req.currentUser! non-null assertion sin guard** — Si authMiddleware se remueve o reordena lanza `TypeError` en lugar de 401. Patrón pre-existente en el codebase. [src/interfaces/http/controllers/item.controller.ts]
- **Subquery correlacionada para image_paths — N+1 embebido en SQL** — Por cada fila del listado se ejecuta un subquery a item_images. Para MVP (20 items/página) aceptable; fix sería `LEFT JOIN LATERAL`. [src/infrastructure/database/supabase/item.repository.ts]
- **Mutación de req.query en el validador** — `req.query = result.data as unknown as typeof req.query` en lugar de un campo dedicado `req.validatedQuery`. Patrón pre-existente en el codebase. [src/interfaces/validators/list-items.validator.ts]
- **Cast de condition de string a ItemCondition sin validación en runtime** — `row.condition as ItemCondition` no verifica que el valor sea un miembro válido del enum. Patrón pre-existente en repositorios. [src/infrastructure/database/supabase/item.repository.ts]
- **page > totalPages retorna 200 con payload inconsistente** — Un page fuera de rango devuelve `{ items: [], pagination: { page: 4, totalPages: 3 } }`. Comportamiento REST estándar; sin validación de page máximo por diseño.

## Deferred from: code review of 2-3-ver-detalle-de-objeto (2026-05-06)

- **Test 10.6 valida FR34 solo a nivel de mock** — la rama CASE SQL real (purge de imágenes tras 30 días) no tiene cobertura de integración; el test simplemente retorna `imagePaths: []` desde el mock. [tests/items-get.test.ts]
- **`completedAt` dead field en `ItemDetail`** — mapeado en el repositorio desde la DB pero no incluido en `GetItemResponseDto` ni en el use-case. Si es intencional, debería eliminarse de la interfaz de dominio para evitar mapeo muerto. [src/domain/repositories/item.repository.ts]
- **Orden de rutas `GET /:id` puede silenciar futuros `GET /nombrado`** — cualquier ruta `GET /stats`, `GET /search`, etc. añadida después de `/:id` en `items.routes.ts` será capturada por el wildcard y retornará 400 en lugar de enrutar correctamente. [src/interfaces/http/routes/items.routes.ts]
- **Cast de `condition`/`status` sin validación en runtime** — `row.condition as ItemCondition` y `row.status as ItemStatus` no verifican que el valor de DB sea un miembro válido. Patrón pre-existente en todos los repositorios. [src/infrastructure/database/supabase/item.repository.ts]
- **`req.currentUser!` sin guard de runtime** — si `authMiddleware` es removido o reordenado lanza `TypeError` en lugar de 401. Patrón pre-existente en el codebase. [src/interfaces/http/controllers/item.controller.ts]
- **`donor.reputationScore` podría ser NULL** — `u.reputation_score` no tiene CHECK de NOT NULL en la query; si el schema permite NULL, silenciosamente rompe el tipo `number` del DTO. [src/infrastructure/database/supabase/item.repository.ts]

## Deferred from: code review of 2-4-cancelar-objeto-sin-sesion-activa (2026-05-06)

- **TOCTOU entre session check y cancelItem** — tres queries no atómicas; race condition teórica entre `hasActiveDeliverySession` y `cancelItem`. Intencional por spec; la transacción completa se implementa en Historia 4.5. [src/application/use-cases/item/cancel-item.use-case.ts]
- **`req.currentUser!.id` non-null assertion sin guard** — si authMiddleware se reordena lanza TypeError en lugar de 401. Patrón pre-existente; authMiddleware wired antes del handler en la ruta. [src/interfaces/http/controllers/item.controller.ts]
- **`buildTestApp` shallow merge para deps no-itemRepo** — pasar partial `jwtService`/`userRepo` reemplaza el objeto completo; latent footgun para futuros tests. No afecta tests actuales. [tests/items-cancel.test.ts]
- **ForbiddenException message delegado al throw site** — patrón frágil para NFR5; si futuro call-site pasa mensaje revelador, el handler lo expone. Actualmente genérico. [src/interfaces/http/middlewares/error-handler.ts]
- **Sin test para 500 path (error de DB en cancelItem)** — cobertura del next(err) path no verificada. Patrón pre-existente en todos los test files del proyecto. [tests/items-cancel.test.ts]

## Deferred from: code review of 2-5-pausar-y-reanudar-solicitudes-de-un-objeto (2026-05-07)

- **TOCTOU race entre `findItemOwnership` y `setPauseStatus`** — dos queries no atómicas sin transacción; un cancel concurrente puede actualizar `requests_paused` en un item ya no activo. Patrón pre-existente en el codebase (ver 2-4). [src/application/use-cases/item/pause-item.use-case.ts]
- **`status: string` no tipado en `FindItemOwnershipResult`** — comparación magic string `'active'` sin protección de compilación. Definir union type cuando se consoliden los status values del schema. [src/domain/repositories/item.repository.ts:59]
- **`req.currentUser!` non-null assertion** — produce TypeError en lugar de 401 si authMiddleware es reordenado. Patrón pre-existente en todos los controladores. [src/interfaces/http/controllers/item.controller.ts]
- **`setPauseStatus` SQL no actualiza `updated_at`** — puede afectar auditoría si la columna existe sin trigger de DB. Verificar si tabla `items` tiene trigger o columna gestionada por app. [src/infrastructure/database/supabase/item.repository.ts]
- **Validator sin `.strict()`** — campos extra en el body son descartados silenciosamente sin error. Patrón pre-existente en todos los validators del proyecto. [src/interfaces/validators/pause-item.validator.ts]

## Deferred from: code review of 2-6-degradacion-automatica-de-objetos-inactivos (2026-05-07)

- **`setInterval` handle no almacenado** — `startItemDegradationScheduler` descarta el handle de `setInterval`; el scheduler no puede detenerse (graceful shutdown, tests de integración). [src/infrastructure/scheduler/item-degradation.scheduler.ts:16]
- **Multi-instancia duplica emails de degradación** — Cada instancia del servidor arranca su propio `setInterval`. En horizontal scaling (Railway multi-instance) cada instancia envía TPL-007 independientemente → N emails por donante. [src/main.ts:18]
- **`pino()` module scope en archivos nuevos del scheduler** — `degrade-inactive-items.use-case.ts` e `item-degradation.scheduler.ts` instancian `pino()` a nivel de módulo, consistente con el patrón pre-existente pero sin compartir config. Consolidar con logger singleton cuando se aborde la historia de logging. [degrade-inactive-items.use-case.ts:5, item-degradation.scheduler.ts:4]
- **`donorEmail` sin validación de null en query** — `findNewlyDegradedItems` no filtra `u.email IS NOT NULL`. Si el schema permite NULL en `users.email`, `mailService.send({ to: null })` lanzaría excepción capturada por el try/catch. Verificar constraint NOT NULL en la migración de users. [src/infrastructure/database/supabase/item.repository.ts:278]

## Deferred from: code review of 2-7-purga-automatica-de-imagenes-y-cola-de-borrado-en-storage (2026-05-07)

- **DELETE sin LIMIT en migration 007** — Riesgo de lock prolongado en `item_images` aceptado para MVP; backlog inicial pequeño. Reevaluar si el volumen crece. [src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql]
- **`processDeletionQueue` no declarado en `IStorageService`** — spec explícitamente eligió "sin domain interface" para esta historia; scheduler acopla a la clase concreta. Evaluar cuando se introduzca un segundo proveedor de storage o se formalice el contrato.
- **UPDATE puede fallar tras storage.remove() exitoso** — el loop captura y loguea el error; la fila queda sin marcar y el borrado de storage se reintenta en el siguiente poll. Benigno si Supabase devuelve éxito en doble borrado; verificar comportamiento real del SDK si se observan reintentos excesivos.
- **Sin retry counter ni dead-letter para borrados permanentemente fallidos** — paths de storage inválidos o corrompidos generarán errores en cada ciclo de polling indefinidamente. Implementar `retry_count` / `max_retries` en `storage_deletion_queue` cuando los logs muestren ruido repetido.
- **Logger pino() módulo-level sin LOG_LEVEL** — `storage-deletion.scheduler.ts` y `supabase-storage.adapter.ts` instancian `pino()` sin configuración, ignorando `env.LOG_LEVEL`. Patrón pre-existente; consolidar con logger singleton cuando se aborde la historia de logging.
- **Sin documentación de coordinación operacional entre pg_cron (03:00 UTC) y scheduler Node (10 min)** — el job SQL y el polling Node son independientes. Documentar en runbook operacional qué sucede si Railway tiene downtime en la ventana 03:00 UTC.

## Deferred from: code review of 1-5-recuperacion-y-reset-de-contrasena (2026-05-06)

- **Silent success si usuario es borrado entre `findById` y la transacción** — ON DELETE CASCADE ya elimina el token cuando se borra el usuario, pero en la ventana entre `findById` y `markUsedAndResetUserPassword` ambos UPDATEs afectan 0 filas y el commit retorna 200 sin efecto real. Riesgo mínimo en producción; fix sería verificar `rowCount` en la transacción. [src/infrastructure/database/supabase/password-reset-token.repository.ts]
- **AC#5 sin test de integración explícito** — El `jwt_version` se incrementa correctamente en la transacción pero no hay test end-to-end que emita un JWT, complete el reset, y verifique que el JWT antiguo retorna 401. Cubierto por diseño (story 1.4 testea el middleware de forma independiente). [tests/auth-password-reset.test.ts]

## Deferred from: code review of 3-2-ver-candidatos-rankeados-para-un-objeto (2026-05-08)

- **`req.currentUser!.id` non-null assertion sin guard de runtime** — Si authMiddleware es removido o reordenado, lanza TypeError en lugar de 401. El authMiddleware está wired antes del handler, por lo que es seguro en el estado actual. Patrón pre-existente en todos los controladores. [src/interfaces/http/controllers/item.controller.ts]

## Deferred from: code review of 3-3-incremento-automatico-de-cycles-at-limit (2026-05-09)

- **Race condition: unschedule y schedule sin transacción** — Dos statements separados sin BEGIN/COMMIT; si la migración se interrumpe entre ellos el job queda desregistrado. Pre-existing pattern (mismo que 006/007). [008-setup-increment-cycles-at-limit-job.sql]
- **Excepción silenciosa enmascara ausencia de pg_cron** — `EXCEPTION WHEN OTHERS THEN NULL` suprime todo error incluyendo extensión no instalada. Pre-existing pattern (mismo que 006/007). [008-setup-increment-cycles-at-limit-job.sql:3-7]
- **Mismatch de precisión temporal: app usa 720h, job usa INTERVAL '30 days'** — `30 days` es calendar-aware (DST); difiere hasta 1 hora de las exactas 720h que usa la app para enforcement. Diferencia mínima para batch diario. [008-setup-increment-cycles-at-limit-job.sql:19]
- **cycles_at_limit sin cota máxima ni reset** — Usuarios con 3+ solicitudes mensuales acumulan penalización indefinidamente; no hay decaimiento. Decisión de diseño pre-existente, fuera de scope de esta historia.
- **Índice parcial no cubre nuevos usuarios (cycles_at_limit = 0)** — `idx_users_cycle_increment WHERE cycles_at_limit > 0` no aplica a la rama `IS NULL`; full scan en la tabla users para usuarios nuevos. Pre-existente en migración 001. [migrations/001-create-users.sql:23-25]
- **Sin garantía de rollback para catálogo pg_cron** — `cron.schedule` escribe en tablas propias de la extensión; puede no revertirse si la migración falla en un statement posterior. Pre-existing pattern (mismo que 006/007). [008-setup-increment-cycles-at-limit-job.sql]
- **Nombre de job sin prefijo de entorno** — `'increment-cycles-at-limit'` colisiona si staging y prod comparten el mismo cluster de DB. Pre-existing naming convention (mismo patrón que jobs 006/007).

## Deferred from: code review of 4-2-ver-detalle-de-sesion-de-entrega (2026-05-13)

- **Escenario de auto-donación (donorId === receiverId)** — si el schema no prohíbe que donor y receiver sean el mismo usuario, `revealContactChannel` sería true para alguien que es simultáneamente donante y receptor. Concern pertenece a la creación de sesiones (historia 4-1). [src/application/use-cases/delivery-session/get-delivery-session.use-case.ts:22]
- **Ambigüedad null de contactChannel** — cuando `contactChannel` es null en DB con sesión activa y no purgada, el receptor recibe null indistinguible de los casos de ocultamiento. Bajo riesgo dado que el flujo de selectReceiver garantiza el campo. Decisión de producto si se quiere diferenciar. [src/application/dtos/get-delivery-session.dto.ts]
- **Sin garantía compile-time de exclusión de donorId/receiverId del DTO** — el DTO no incluye esos campos pero nada impide un `...session` accidental en el futuro. Consideración defensiva. [src/application/dtos/get-delivery-session.dto.ts]
- **sessionId sin validación en capa repositorio** — `findById` recibe string arbitrario; validación ocurre solo en la cadena HTTP. Patrón consistente con el codebase. [src/infrastructure/database/supabase/delivery-session.repository.ts]
- **Singleton deliverySessionRouter en module load** — instanciado con dependencias reales al importar el módulo; patrón idéntico al de itemRouter y authRouter. [src/interfaces/http/routes/delivery-sessions.routes.ts:41]
- **req.currentUser! sin guard de runtime** — si authMiddleware no popula currentUser (middleware mal ordenado, futuro error), lanza TypeError en vez de 401. Pre-existing en todos los controllers. [src/interfaces/http/controllers/delivery-session.controller.ts:13]
- **Test 16.1 usa assertions de ausencia en lugar de set exacto de keys** — no detectaría nuevos campos sensibles añadidos accidentalmente al DTO en el futuro. [tests/delivery-sessions-get.test.ts:94]
- **Sin test para contactChannel=null con sesión activa y no purgada** — estado válido en DB (columna nullable) aunque el flujo normal lo evita. [tests/delivery-sessions-get.test.ts]
- **Remoción de validateUuidParam → DatabaseError → 500** — sin el middleware UUID, una string inválida llega al repo y produce error de pg no tipado que el error handler convierte en 500. Patrón pre-existente en todos los repos. [src/infrastructure/database/supabase/delivery-session.repository.ts]

## Deferred from: code review of 4-1-seleccionar-receptor-para-un-objeto (2026-05-13)

- **TOCTOU: ownership check fuera de la transacción** — `findItemOwnership` corre como SELECT no bloqueante antes de abrir la transacción. Teórico en este dominio ya que la propiedad del item es inmutable. Consistent con el patrón pre-existente de otros use-cases. [src/application/use-cases/item/select-receiver.use-case.ts:27]
- **donorId no verificado en el SQL de la transacción** — el SELECT FOR UPDATE no incluye `AND i.donor_id = input.donorId`. Concern de defensa en profundidad: si el repo es llamado directamente (tests, futura refactorización), la verificación de ownership se omite a nivel de DB. [src/infrastructure/database/supabase/delivery-session.repository.ts:25]
- **Sin índice en item_id en delivery_sessions** — consultas por `item_id` (e.g., `hasActiveDeliverySession`) requieren scan completo de la tabla a medida que crece. Añadir `CREATE INDEX idx_delivery_sessions_item ON delivery_sessions(item_id)` en migración futura. [src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql]
- **contactChannel sin validación de longitud máxima** — `z.string().min(1)` sin `.max()` permite almacenar strings arbitrariamente grandes. Añadir `.max(500)` o similar para evitar abuse de storage. [src/interfaces/validators/select-receiver.validator.ts:5]

## Deferred from: code review of 4-3-confirmar-entrega-completada (2026-05-13)

- **`receiver_id` potencialmente NULL antes de usarlo en UPDATEs y INSERT** — por diseño, `delivery_sessions` siempre se crea con receptor (historia 4.1); FK probable garantiza NOT NULL. Reevaluar si el schema cambia. [src/infrastructure/database/supabase/delivery-session.repository.ts]
- **Donor/receiver borrados mid-transacción** — FK constraints sobre `delivery_sessions` deberían prevenir borrado mientras hay sesión activa. Verificar si las FK están definidas con ON DELETE RESTRICT explícito. [src/infrastructure/database/supabase/delivery-session.repository.ts]
- **`ConfirmDeliveryUseCase` es pass-through puro** — patrón arquitectónico establecido en el proyecto; thin use cases que delegan completamente al repo. Evaluar si agregar `status: 'completed'` al resultado del repo eliminaría el need de este nivel. [src/application/use-cases/delivery-session/confirm-delivery.use-case.ts]
- **`SESSION_UUID` y `mockUser` duplicados entre archivos de test** — mismas constantes en `delivery-sessions-confirm.test.ts` y `delivery-sessions-get.test.ts`. Centralizar en un `tests/fixtures/delivery-session.fixtures.ts` cuando crezca la suite. [tests/delivery-sessions-confirm.test.ts]

## Deferred from: code review of 4-4-cancelar-sesion-de-entrega-y-declarar-no-show (2026-05-13)

- **SELECT FOR UPDATE sin lock_timeout** — Bajo carga concurrente, un `SELECT ... FOR UPDATE` sin `NOWAIT` ni `lock_timeout` puede bloquear indefinidamente y agotar el connection pool. Patrón pre-existente (mismo en `confirmDelivery`). [src/infrastructure/database/supabase/delivery-session.repository.ts]
- **req.currentUser! non-null assertion sin guard de runtime** — Si `authMiddleware` no popula `currentUser` (middleware mal ordenado, futura refactor), lanza `TypeError` en lugar de 401. Patrón pre-existente en todos los controladores. [src/interfaces/http/controllers/delivery-session.controller.ts]
- **Sin content-type enforcement en el validator** — `z.boolean()` rechaza strings, pero sin middleware de content-type, un body `application/x-www-form-urlencoded` llega como string y produce 400 sin orientación al cliente. Patrón pre-existente en todos los validators. [src/interfaces/validators/cancel-delivery.validator.ts]
- **req.body.noShow puede ser undefined si el validator es bypasseado** — Si `validateCancelDeliveryBody` es omitido o reordenado, `noShow` llega como `undefined` y PostgreSQL almacena NULL silenciosamente. Patrón pre-existente en todos los controladores. [src/interfaces/http/controllers/delivery-session.controller.ts]
- **UPDATE items status='active' incondicional puede resucitar item pausado/borrado externamente** — Si un admin cambió el status del item después de la reserva pero antes de la cancelación, `UPDATE items SET status='active'` sobreescribe ese cambio. Spec-compliant para el flujo normal; añadir `WHERE status = 'reserved'` como guard defensivo futuro. [src/infrastructure/database/supabase/delivery-session.repository.ts]

## Deferred from: code review of 4-5-cancelar-objeto-con-sesion-activa (2026-05-13)

- **Múltiples sesiones activas: solo `rows[0]` cancelada** — si el DB tuviera más de una sesión activa por ítem (la invariante de aplicación actualmente impide esto), solo la primera se cancela y las demás quedan huérfanas sin notificación. [src/infrastructure/database/supabase/item.repository.ts]
- **Item pausado: cancelación no notifica a solicitantes pendientes** — `requests_paused=true` permite cancelación sin notificar a usuarios que solicitaron el objeto. Fuera del scope de historia 4.5. [src/application/use-cases/item/cancel-item.use-case.ts]
- **Logger pino inicializado con `env.LOG_LEVEL` en import-time** — nivel de log fijo al cargar el módulo; patrón pre-existente en el proyecto. Consolidar con logger singleton cuando se aborde la historia de logging. [src/application/use-cases/item/cancel-item.use-case.ts]
- **`userRepo.findById` awaiteado demora la respuesta 200 post-commit** — la búsqueda del receptor bloquea la respuesta HTTP aunque la transacción ya fue commiteada; decisión de diseño explícita en Dev Notes del spec. [src/application/use-cases/item/cancel-item.use-case.ts]

## Deferred from: code review of 4-6-expiracion-automatica-de-sesiones-y-purga-de-canal-de-contacto (2026-05-13)

- **`purge-contact-channel` nunca purga sesiones expiradas** — `completed_at` es NULL en sesiones con `status = 'expired'`, por lo que el filtro `completed_at < NOW() - INTERVAL '7 days'` las excluye permanentemente. El contact_channel de sesiones expiradas nunca se purga, reteniendo PII indefinidamente. Fix: usar `(completed_at IS NULL OR completed_at < NOW() - INTERVAL '7 days')` en el WHERE del job. Diferido per spec: la migración 011 implementa exactamente lo que dice la arquitectura §7 Job 3. [src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql:38-43]

## Deferred from: code review of 3-1-solicitar-un-objeto (2026-05-08)

- **40001 → 409 sin retry** — Serialization failure se convierte en ConflictException HTTP 409; correcto para MVP pero semánticamente incorrecto (409 implica conflicto permanente, no transitorio). Aceptado explícitamente en Dev Notes como MVP. [src/infrastructure/database/supabase/request.repository.ts:54]
- **Status/requestsPaused no atómicos con INSERT** — `findItemOwnership` corre fuera de la transacción SERIALIZABLE en el use case. En la ventana entre el guard y el INSERT, un cancel/pause concurrente puede cambiar el estado del item. Requeriría mover los checks de status dentro de la transacción del repo. [src/application/use-cases/item/request-item.use-case.ts:19]
- **TPL-006 sin contexto del objeto** — El email de notificación al donante no incluye nombre, ID ni link del objeto. Si el donante tiene múltiples objetos activos, no puede identificar cuál recibió la solicitud. Gap de UX para mejora futura. [src/infrastructure/email/resend.provider.ts:22]
- **Sin rate limit HTTP en `POST /:id/requests`** — El endpoint solo aplica el rate limit global del app. Sin rate limit por usuario/item, una ráfaga de requests cargará el DB aunque sean rechazados por la transacción SERIALIZABLE. [src/interfaces/http/routes/items.routes.ts:109]
- **Sin test unitario para 40001 → HTTP 409 (AC #5)** — Tests 13.3/13.4 mockean ConflictException genérico. No hay test específico que simule el código 40001 llegando desde el repo y verifique que resulta en HTTP 409. Requeriría test de integración con DB real. [tests/items-request.test.ts]
- **Lógica de ROLLBACK convoluta** — Triple try/catch con guards instanceof en PostgresRequestRepository.create; correcta pero difícil de auditar. Candidata a refactoring con un patrón de transacción wrapper. [src/infrastructure/database/supabase/request.repository.ts:36]

## Deferred from: code review of 5-1-ver-perfil-privado-del-usuario-autenticado (2026-05-18)

- **Singleton `userRouter = createUserRouter()` instancia infraestructura real al importar** — mismo patrón pre-existente en `authRouter`, `itemRouter`, `deliverySessionRouter`. Evaluar junto con los demás cuando se introduzca un contenedor IoC. [src/interfaces/http/routes/users.routes.ts:35]
- **`buildTestApp` shallow merge puede perder mocks en futuras extensiones** — `{ ...defaultDeps, ...depOverrides }` reemplaza objetos de dep completos; latent footgun para futuros tests. Mismo patrón pre-existente en otras suites. [tests/users-me.test.ts:45]
- **`GET /users/me` sin rate limiting específico** — pollear `consecutiveNoShows` permite inferir eventos del sistema en near-real-time. Mitigado por rate limiting global del app. Evaluar si se añade rate limiting por endpoint en un hardening futuro.
- **`UserController` acoplado a clase concreta `GetPrivateProfileUseCase`** — violación de DIP; dificulta unit test del controller en aislamiento. Patrón pre-existente en todos los controllers del proyecto. [src/interfaces/http/controllers/user.controller.ts:3]
- **Route importa infraestructura concreta en la capa de interfaces** — `db`, `JwtService`, `PostgresUserRepository` importados directamente en `users.routes.ts`. Patrón pre-existente en todas las routes. [src/interfaces/http/routes/users.routes.ts:2-4]
- **`PostgresUserRepository.findById` selecciona columnas sensibles** — `password_hash`, `jwt_version`, `cycles_at_limit`, `last_cycle_incremented_at`, `last_active_at` viajan desde DB hasta la capa de aplicación aunque el DTO los filtra. NFR2 requeriría que el SELECT los excluya. Pre-existente en el repositorio (usado también por el authMiddleware). [src/infrastructure/database/supabase/user.repository.ts]
- **Test 21.4 no cubre `reputationScore = NaN` o `Infinity`** — valor corrompido en DB se serializa como `null` silenciosamente en JSON. Extreme edge case; el schema Postgres previene esto en condiciones normales. [tests/users-me.test.ts:77]

## Deferred from: code review of 5-3-ver-sesiones-de-entrega-propias (2026-05-19)

- **COUNT/SELECT sin transacción — TOCTOU en paginación** — Las queries COUNT y SELECT corren en statements separados sin transacción; bajo escrituras concurrentes `total` puede diferir del `sessions.length` real. Aceptable para read endpoints. [src/infrastructure/database/supabase/user.repository.ts]
- **Sin cota superior en `page`** — El validador Zod solo impone `min(1)` en `page`; valores extremos (ej. page=2147483647) producen un OFFSET gigante que Postgres maneja devolviendo resultado vacío sin error. No hay feedback al cliente. [src/interfaces/validators/list-my-delivery-sessions.validator.ts]
- **`buildTestApp` shallow spread en tests** — `{ ...defaultDeps, ...depOverrides }` reemplaza el objeto `userRepo` completo; pasar solo una propiedad overrideada descarta el resto. Footgun latente para futuros tests. Patrón pre-existente en otras suites. [tests/users-delivery-sessions.test.ts]

## Deferred from: code review of 5-4-ver-objetos-publicados-propios (2026-05-19)

- **Test 24.4 prueba solo el mapeo DTO, no la lógica SQL CASE WHEN de FR34** — el mock retorna `imagePaths: []` directamente; la lógica `COALESCE / CASE WHEN` real en el repositorio no tiene cobertura. Requeriría test de integración con DB real. [tests/users-items.test.ts]
- **TOCTOU: COUNT y SELECT corren en queries separadas sin transacción** — bajo escrituras concurrentes, `total` e `items.length` pueden divergir. Patrón pre-existente compartido con `findMyDeliverySessions`. [src/infrastructure/database/supabase/user.repository.ts]
- **Sin cota superior en page — OFFSET arbitrariamente grande posible** — `page=999999` produce OFFSET ~20B, que Postgres resuelve con full scan. Patrón pre-existente en `list-my-delivery-sessions.validator.ts`. [src/interfaces/validators/list-my-items.validator.ts]
- **Sin índice compuesto en (donor_id, status, created_at)** — la query filtra por `donor_id` con ORDER BY `created_at DESC`; para donors con muchos items se ejecuta un sequential scan. Limitación pre-existente del schema; requiere migración aprobada. [migrations]
- **page > totalPages retorna 200 vacío sin indicación de out-of-bounds** — consistente con el comportamiento de `findMyDeliverySessions`; sin validación de page máximo por diseño.

## Deferred from: code review of 5-2-ver-historial-de-reputacion (2026-05-18)

- **`type` de `reputation_events` no validado en runtime** — `row.type` mapeado directamente al union TypeScript sin guard de runtime; un valor inesperado en DB pasa silenciosamente al cliente. Patrón pre-existente en todos los repositorios. [src/infrastructure/database/supabase/user.repository.ts]
- **`createdAt: Date` en DTO pero string ISO-8601 sobre HTTP** — `JSON.stringify` convierte el `Date` a string; el DTO declara `Date`, engañando a consumidores del tipo. El test 22.4 no verifica el shape del valor. Patrón pre-existente en el proyecto. [src/application/dtos/get-reputation-history.dto.ts]
- **`delta` no validado en runtime** — columna `INTEGER` en DB, mapeada como `number` en TypeScript sin validación; si el tipo de columna cambia en una migración futura, el valor pasa sin conversión. Patrón pre-existente en todos los repositorios. [src/infrastructure/database/supabase/user.repository.ts]
- **Test 22.2 solo verifica longitud del array, no los campos del evento** — `toHaveLength(1)` es trivialmente satisfecho por el mock; un mapeo roto con campos `undefined` pasaría igual. Cubierto campo a campo en 22.4. [tests/users-reputation-history.test.ts]
- **Sin test para JWT expirado/inválido en la nueva ruta `/me/reputation-history`** — el comportamiento del auth middleware ante token inválido no está cubierto en el nuevo test file. Comportamiento del middleware ya probado en `users-me.test.ts`. [tests/users-reputation-history.test.ts]
- **Sin índice compuesto en `(user_id, created_at DESC)`** — el índice simple en `user_id` obliga a filesort en cada consulta de historial. Optimización que requiere aprobación de cambio de schema. [schema/reputation_events]
- **`userRouter` singleton en `users.routes.ts` crea conexión real a DB al importar el módulo** — riesgo latente para tests futuros que importen el módulo transitivamente. Patrón pre-existente (igual que `authRouter`, `itemRouter`, `deliverySessionRouter`). [src/interfaces/http/routes/users.routes.ts]

## Deferred from: code review of 5-6-ver-perfil-publico-de-un-usuario (2026-05-20)

- **`createdAt: Date` en DTO serializa como ISO string sobre HTTP** — `GetPublicProfileResponseDto` declara `createdAt: Date` pero `res.json()` serializa como string ISO-8601. Engaña a consumidores TypeScript del tipo. Pre-existente en todo el proyecto. [src/application/dtos/get-public-profile.dto.ts]
- **Orden de ruta `/:id` fragil para futuros `GET /algo`** — Cualquier ruta `GET /users/algo` añadida después de `/:id` en `users.routes.ts` será silenciada por Express. Código actual correcto; riesgo de mantenimiento futuro ya documentado en el spec. [src/interfaces/http/routes/users.routes.ts:80]
- **Patrón shallow-merge en `buildTestApp` + `depOverrides`** — Reemplaza el objeto `userRepo` completo al hacer override; futuros métodos en `IUserRepository` requieren actualización manual en cada test override. Pre-existente en todas las suites. [tests/users-public-profile.test.ts]
- **Sin test para self-profile lookup (USER_UUID === TARGET_UUID)** — Caso donde el usuario autenticado solicita su propio UUID no está cubierto. Comportamiento trivialmente correcto (sin lógica especial) pero path no verificado. [tests/users-public-profile.test.ts]
- **Sin rate-limiting en endpoint de enumeración de usuarios** — `GET /users/:id` solo requiere JWT válido; un usuario autenticado puede iterar UUIDs indefinidamente. Concern arquitectónico pre-existente del proyecto. [src/interfaces/http/routes/users.routes.ts]
- **Mock constants mutables a nivel módulo en tests** — `mockAuthUser` y `mockPublicUser` no están frozen; mutación directa en un test corrompería los siguientes. Test 26.4 usa spread correctamente. Pre-existente en el proyecto. [tests/users-public-profile.test.ts]
- **Campos numéricos podrían ser null en DB** — `reputationScore`, `totalReceived`, `totalDonated` mapeados sin null-guard; si la DB retorna null, el JSON serializa null en lugar de number. El schema debería prevenirlo. Pre-existente en todos los use cases que leen User. [src/application/use-cases/user/get-public-profile.use-case.ts]
- **`createdAt` podría ser null en DB** — Mapeado directamente sin null-check; schema debería prevenirlo. Pre-existente en el repositorio de usuarios. [src/application/use-cases/user/get-public-profile.use-case.ts]
- **Sin test para error de repositorio (DB down)** — `findById` que rechaza con Error no está cubierto; el catch block genérico no está verificado. Patrón pre-existente en todas las suites. [tests/users-public-profile.test.ts]
- **Race condition: auth user eliminado mid-flight** — `authMiddleware` verifica JWT y popula `req.currentUser`; si el usuario autenticado es eliminado antes de que el use case corra, la inconsistencia puede producir comportamiento inesperado. Afecta todos los endpoints autenticados; pre-existente. [src/interfaces/http/controllers/user.controller.ts]

## Deferred from: code review of 6-1-migracion-sql-y-entidad-user-dlt-003 (2026-05-24)

- **Migración no verificada contra BD real (MEDIUM)** — `npm run migrate` no ejecutado (ECONNREFUSED :5432 en entorno dev). SQL sintetizado es correcto; debe ejecutarse antes de deployar historia 6.2 con BD activa. [012-users-dlt-003.sql]
- **Sin wrapper BEGIN/COMMIT en migración (LOW)** — Patrón pre-existente en las migraciones 001–011. Cada DDL es atómico en PostgreSQL y la migración es re-entrant gracias a `IF NOT EXISTS` y `SET NOT NULL` idempotente. [012-users-dlt-003.sql]
- **Sin CHECK constraint en `preferred_language` (LOW)** — Columna acepta cualquier string. Arquitectura documenta "MVP: único valor 'es'" sin requerir CHECK; la restricción pertenece a una futura historia de i18n. [012-users-dlt-003.sql]
- **Placeholders hardcodeados 'Usuario'/'Pendiente' en INSERT (LOW)** — Explícitamente temporal según spec §Task 3; historia 6.2 reemplaza con valores validados del payload de registro. [user.repository.ts:68]

## Deferred from: code review of 5-5-ver-solicitudes-realizadas-propias (2026-05-19)

- **`params` array mutado entre la query COUNT y la query SELECT** — `params` se construye, se pasa al COUNT, y luego se muta con `limit`/`offset` antes del SELECT. En un retry tras fallo del COUNT, los índices de `$N` quedan desalineados. Pre-existing pattern en `findMyDeliverySessions` y `findMyItems`. [src/infrastructure/database/supabase/user.repository.ts]
- **`countResult.rows[0]` sin null-check** — si el driver retorna rows vacío (imposible para COUNT(*) en PostgreSQL), el código lanza TypeError. Pre-existing en todos los métodos hermanos. [src/infrastructure/database/supabase/user.repository.ts]
- **`createdAt: Date` en DTO pero serializado como string ISO sobre HTTP** — `JSON.stringify` convierte Date a string; el tipo declarado engaña a consumidores TypeScript. Pre-existing en todo el proyecto. [src/application/dtos/get-my-requests.dto.ts]
- **Sin cota superior en `page`** — el validador solo impone `min(1)`; valores extremos producen OFFSET masivo con resultado vacío, sin error ni 404. Pre-existing en todos los validadores hermanos. [src/interfaces/validators/list-my-requests.validator.ts]
- **TOCTOU COUNT/SELECT sin transacción** — dos queries separadas; bajo escrituras concurrentes `total` e `requests.length` pueden divergir. Pre-existing pattern en todos los endpoints de paginación del proyecto. [src/infrastructure/database/supabase/user.repository.ts]

## Deferred from: code review of 6-2-registro-login-y-middleware-is-active (2026-05-24)

- **`phone: null` en body retorna 400** — `z.string().optional()` no acepta null; clientes que envíen `{"phone": null}` reciben 400 en lugar de tratar el campo como ausente. Elección de diseño Zod; los clientes deben omitir el campo. [src/interfaces/validators/register.validator.ts]

## Deferred from: code review of 6-3-dtos-perfil-privado-y-publico (2026-05-24)

- **`avatarUrl` usa `.url()` en `privateProfileSchema` vs `.string()` en `publicProfileSchema`** — Mismo campo del mismo `User` entity pero con validadores distintos en el OpenAPI document. La spec de la historia especifica explícitamente esta diferencia ("Decisión avatarUrl: alinear con cómo se persistirá en 6.4"). Unificar a `.string().url().nullable()` en ambas cuando 6.4 confirme el formato de almacenamiento. [src/openapi/schemas/user.schemas.ts]
- **`phone: null` ya no cubierto en test 21.2** — El fixture `mockUser.phone` cambió de `null` a `'+34600111222'`; el caso de phone nulo en respuesta de `/users/me` ya no se verifica explícitamente (cubierto implícitamente por `avatarUrl: null` en el mismo test). Añadir test con `phone: null` en 6.4 cuando se implemente `PATCH /users/me`. [tests/users-me.test.ts]

## Deferred from: code review of 6-4-patch-users-me-actualizacion-perfil (2026-05-24)

- **TOCTOU doble-encolado en `storage_deletion_queue`** — Si dos PATCH /users/me concurrentes usan el mismo `previousAvatarUrl`, ambos pueden encolar el mismo storage path. Doble borrado es idempotente en Supabase Storage pero genera ruido. En MVP aceptado; resolver con optimistic locking o SELECT FOR UPDATE en la transacción al escalar. [src/infrastructure/database/supabase/user.repository.ts]

## Deferred from: code review of 6-5-emails-saludo-personalizado-firstname (2026-05-24)

- **XSS potencial en `greetingHtml()`** — `firstName` se interpola directamente en HTML sin escaping HTML (sin `&lt;` / `&gt;`). Mitigado en MVP por la validación regex de 6.2 (solo letras Unicode, 2–50 chars, sin `<>`). Si en el futuro se relaja esa validación, añadir `escapeHtml()` antes de la interpolación. [src/infrastructure/email/resend.provider.ts:13]

## Deferred from: code review of 7-5-instrumentacion-objetos-y-solicitudes (2026-05-25)

- **Dependency injection inestable en SelectReceiverUseCase** — Cambio súbito de constructor sugiere arquitectura inestable, pero es necesario para implementación actual.

## Deferred from: code review of 9-5-limpieza-no-unstyled-email (2026-05-27)

- **Validación HTTPS inconsistente para enlaces CTA en layout** — `renderEmailLayout` valida `fallbackLink` con `https://` solo en producción, pero no aplica la misma regla a `cta.href`. Riesgo de enlaces no seguros si una plantilla pasa URL no-HTTPS. [src/infrastructure/email/templates/layout/email-layout.ts]
- **Plantillas aceptan variables críticas ausentes y convierten a `String(undefined)`** — En TPLs con links (`TPL-002`, `TPL-009`), variables obligatorias pueden terminar como texto inválido fuera de prod (sin guard fuerte). Es un patrón previo a 9.5 y no fue introducido por esta historia. [src/infrastructure/email/templates/tpl-009-email-verification.ts]

## Deferred from: code review of spec-admin-system-health-expanded (2026-06-18)

- **Build global en rojo por tipos preexistentes no relacionados con System Health** — `npm run build` falla por `locationName` faltante en `DeliverySessionOtherPartyDto` y `RankedCandidateDto` en flujos ajenos a esta historia. Bloquea verificación full-build aunque los tests y cambios de System Health pasan. [src/application/use-cases/delivery-session/get-delivery-session.use-case.ts, src/application/use-cases/item/get-ranked-candidates.use-case.ts]
## Deferred from: code review of spec-fix-admin-system-health-jobname-column (2026-06-18)

- **Migración 024 conserva riesgo de fallo si `public.reports` no existe** - el bloque de guardado en `DO $$` no envuelve el `ALTER TABLE` posterior. Hallazgo real pero fuera del scope de este fix de health endpoint. [src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql]
- **Migración 024 podría eliminar checks no objetivo sobre `reason`** - el loop de drop quita cualquier CHECK que toque `reason` y recrea solo uno. Riesgo existente no introducido por este fix. [src/infrastructure/database/supabase/migrations/024-fix-reports-reason-check.sql]
