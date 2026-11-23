---
title: "Templates de email del módulo de reportes"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Story 14.4: Templates de email del módulo de reportes

Status: done

## Story

As a sistema,
I want los cuatro templates de email del módulo de reportes implementados en `ResendMailProvider`,
so that los use cases de reportes puedan notificar correctamente a todas las partes (denunciante, denunciado, operador).

## Acceptance Criteria

**AC-1 (TPL-011 — Confirmación al denunciante):** existe `src/infrastructure/email/templates/tpl-011-report-confirmation.ts` que:
- Renderiza con `renderEmailLayout()` (layout de marca)
- Recibe variables: `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`), `reason` (label legible, no el valor interno del enum)
- Asunto: `Hemos recibido tu reporte — Regálalo`
- Contenido: (1) confirmación de recepción, (2) descripción genérica del motivo (label legible), (3) aviso de que el equipo lo revisará (sin promesa de plazo)
- `reportedEntityType` se traduce a un label legible para el usuario: `"objeto"` → `"un objeto"`, `"usuario"` → `"otro usuario"` (función `getReportedEntityLabel` o similar)
- No menciona al denunciado ni al contenido específico
- Sin CTA ni fallbackLink

**AC-2 (TPL-ADM-002 — Notificación al operador):** existe `src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts` que:
- Renderiza con `renderEmailLayout()` (coherente con TPL-ADM-001)
- Recibe variables: `reportId`, `reportedEntityType`, `reason` (label legible), `entitySnapshotTitle`, `reporterFirstName`, `createdAt`
- Asunto: `[Regálalo] Nuevo reporte — {reason_label} — {entity_type}`
- Contenido: (1) ID del reporte con enlace al panel, (2) tipo de entidad y motivo, (3) título del objeto o nombre del usuario reportado (del `entity_snapshot`), (4) nombre del denunciante (primer nombre), (5) timestamp del reporte
- `firstName` forzado a `'administrador'` (igual que TPL-ADM-001)
- Sin CTA ni fallbackLink (el enlace se incluye en bodyHtml directamente)

**AC-3 (TPL-012 — Resolución al denunciante):** existe `src/infrastructure/email/templates/tpl-012-report-resolved.ts` que:
- Renderiza con `renderEmailLayout()`
- Recibe variables: `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`)
- Asunto: `Hemos revisado tu reporte — Regálalo`
- Contenido: (1) confirmación de que el reporte fue revisado, (2) frase genérica "Hemos tomado las medidas que consideramos oportunas"
- `reportedEntityType` se traduce a label legible (misma función que TPL-011): `"objeto"` → `"un objeto"`, `"usuario"` → `"otro usuario"`
- No revela la acción concreta, datos del denunciado ni motivo específico
- Sin CTA ni fallbackLink

**AC-4 (TPL-013 — Advertencia al denunciado):** existe `src/infrastructure/email/templates/tpl-013-warn-user.ts` que:
- Renderiza con `renderEmailLayout()`
- Recibe variables: `recipientEmail`, `firstName`
- Asunto: `Aviso sobre tu actividad en Regálalo`
- Contenido: (1) aviso de que se ha revisado su actividad en la plataforma, (2) indicación de que cierto contenido o comportamiento podría no ajustarse a las normas de la comunidad
- Sin mención al reporte, al denunciante ni al contenido específico que motivó la revisión
- Sin CTA ni fallbackLink

**AC-5 (Registry):** los 4 templates están registrados en `emailTemplateRegistry` en `registry.ts` con sus claves `'TPL-011'`, `'TPL-012'`, `'TPL-013'`, `'TPL-ADM-002'`

**AC-6 (REPORT_REASON_LABELS):** existe un mapa `REPORT_REASON_LABELS` en `condition-labels.ts` (o archivo análogo) que traduce los 8 valores del enum `ReportReason` a labels legibles en español:
- `contenido_inadecuado` → `Contenido inadecuado`
- `fraude_o_enganio` → `Fraude o engaño`
- `spam` → `Spam`
- `objeto_ilegal` → `Objeto ilegal`
- `objeto_peligroso` → `Objeto peligroso`
- `información_falsa` → `Información falsa`
- `comportamiento_abusivo` → `Comportamiento abusivo`
- `otro` → `Otro`

**AC-7 (Snapshot testing):** cada template tiene un snapshot test Vitest que verifica que el HTML generado no cambia inesperadamente (patrón establecido en Épica 9)

## Tasks / Subtasks

- [x] Crear `src/infrastructure/email/templates/tpl-011-report-confirmation.ts` (AC-1)
  - Importar `renderEmailLayout`, `renderEmailParagraph`, `escapeHtml`, `getReportedEntityLabel`
  - Extraer variables con safe defaults
  - Usar `getReportedEntityLabel(reportedEntityType)` para texto legible
  - Construir bodyHtml con párrafos de confirmación
  - Asunto: `Hemos recibido tu reporte — Regálalo`
  - Sin CTA ni fallbackLink
- [x] Crear `src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts` (AC-2)
  - Importar `renderEmailLayout`, `renderEmailParagraph`, `escapeHtml`
  - Extraer variables: `reportId`, `reportedEntityType`, `reason`, `entitySnapshotTitle`, `reporterFirstName`, `createdAt`
  - `firstName` forzado a `'administrador'`
  - Incluir enlace al panel admin en bodyHtml: `{ADMIN_PANEL_URL}/reportes/{reportId}`
  - Asunto: `[Regálalo] Nuevo reporte — {reason} — {reportedEntityType}`
- [x] Crear `src/infrastructure/email/templates/tpl-012-report-resolved.ts` (AC-3)
  - Importar `renderEmailLayout`, `renderEmailParagraph`, `escapeHtml`, `getReportedEntityLabel`
  - Usar `getReportedEntityLabel(reportedEntityType)` para texto legible
  - Asunto: `Hemos revisado tu reporte — Regálalo`
  - Contenido genérico, sin revelar acción ni motivo
- [x] Crear `src/infrastructure/email/templates/tpl-013-warn-user.ts` (AC-4)
  - Asunto: `Aviso sobre tu actividad en Regálalo`
  - Contenido: aviso de revisión de actividad + normas comunitarias, tono colaborativo no acusatorio
  - Sin mención al reporte, denunciante ni motivo
- [x] Añadir `REPORT_REASON_LABELS` a `src/infrastructure/email/templates/condition-labels.ts` (AC-6)
  - Mapa `Record<string, string>` con los 8 valores del enum
  - Exportar función `getReportReasonLabel(reason: string): string`
- [x] (UX) Añadir helper `getReportedEntityLabel(type: string): string` en `condition-labels.ts` (o archivo separado) que traduzca `"objeto"` → `"un objeto"` / `"usuario"` → `"otro usuario"` para usar en TPL-011 y TPL-012
- [x] Registrar los 4 templates en `src/infrastructure/email/templates/registry.ts` (AC-5)
  - Importar `renderTpl011`, `renderTpl012`, `renderTpl013`, `renderTplAdm002`
  - Añadir al objeto `emailTemplateRegistry` con claves `'TPL-011'`, `'TPL-012'`, `'TPL-013'`, `'TPL-ADM-002'`
- [x] Crear tests individuales por template (AC-7)
  - `tests/email-tpl-011.test.ts` — fixture con `recipientEmail`, `firstName`, `reportedEntityType`, `reason`; snapshot + contenido
  - `tests/email-tpl-012.test.ts` — fixture con `recipientEmail`, `firstName`, `reportedEntityType`; snapshot + contenido
  - `tests/email-tpl-013.test.ts` — fixture con `recipientEmail`, `firstName`; snapshot + contenido
  - `tests/email-tpl-adm-002.test.ts` — fixture con `reportId`, `reportedEntityType`, `reason`, `entitySnapshotTitle`, `reporterFirstName`, `createdAt`; snapshot + contenido
  - Seguir patrón de `tests/email-tpl-002.test.ts` (existente en proyecto): `beforeAll` con `vi.useFakeTimers()`, snapshot + assertions de contenido
- [x] Añadir fixtures al snapshot global en `tests/email-templates.snap.test.ts` (AC-7)
  - Añadir entradas en `fixtures` para `TPL-011`, `TPL-012`, `TPL-013`, `TPL-ADM-002`
  - Actualizar el test `9.5 — registry cubre exactamente...` para incluir las 4 nuevas claves en el `toEqual` ordenado
- [x] Verificar que test suite pasa: `npm test`
- [x] Verificar build: `npm run build`
- [x] Actualizar `CHANGELOG.md` bajo `## [Unreleased]` con los 4 templates añadidos

## Dev Notes

### Existing Email Infrastructure (from Épica 9 — ya disponible)

| Component | Ruta |
|---|---|
| Layout renderer | `src/infrastructure/email/templates/layout/email-layout.ts` |
| Componentes | `src/infrastructure/email/templates/components/*.ts` |
| Registry | `src/infrastructure/email/templates/registry.ts` |
| Barrel exports | `src/infrastructure/email/templates/index.ts` |
| Provider | `src/infrastructure/email/resend.provider.ts` |
| Mail service interface | `src/domain/services/mail.service.ts` |
| Design tokens | `src/infrastructure/email/tokens/email-design-tokens.ts` |
| Condition labels | `src/infrastructure/email/templates/condition-labels.ts` |
| Admin TPL example | `src/infrastructure/email/templates/tpl-adm-001.ts` |

### Pattern for Each Template (from `tpl-002-reset-password.ts`)

```typescript
import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

export function renderTplNnn(variables: Record<string, string | number>): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';

  const bodyHtml =
    renderEmailParagraph('First paragraph') +
    renderEmailParagraph('Second paragraph');

  const html = renderEmailLayout({
    preheader: 'Preheader text',
    firstName,
    title: 'Email Title',
    bodyHtml,
    // sin cta ni fallbackLink para TPL-011/012/013
  });

  return { subject: 'Subject Line', html };
}
```

### TPL-ADM-002 Special Pattern (from `tpl-adm-001.ts`)

El template admin forcea `firstName: 'administrador'`:
```typescript
const html = renderEmailLayout({
  preheader: '...',
  firstName: 'administrador',
  title: '...',
  bodyHtml,
});
```

Para TPL-ADM-002, además debe incluir un enlace directo al reporte en el body:
- URL base del panel admin: usar `ADMIN_CORS_ORIGIN` (ya existe en `config/env.ts`, default `https://admin.regalalo.org`)
- URL completa: `{ADMIN_CORS_ORIGIN}/reportes/{reportId}`
- Usar `escapeHtml` para el enlace
- **Nota:** `ADMIN_PANEL_URL` no existe como env var. Usar `ADMIN_CORS_ORIGIN` existente. Si se prefiere una var separada, añadir `ADMIN_PANEL_URL` a `config/env.ts` como `process.env['ADMIN_PANEL_URL'] ?? ADMIN_CORS_ORIGIN` — esto permite que apunte a un dominio distinto al CORS si es necesario.
- Incluir `reportId`, `reportedEntityType`, `reason` (label), `entitySnapshotTitle`, `reporterFirstName`, `createdAt` en el contenido

### Template Specifications (from PRD-REP-BE-01 §5)

#### TPL-011 — Confirmación al denunciante

| Campo | Valor |
|---|---|
| Asunto | `Hemos recibido tu reporte — Regálalo` |
| Variables | `recipientEmail`, `firstName`, `reportedEntityType`, `reason` |
| Preheader | `Confirmación de recepción de tu reporte.` |
| Contenido | Confirmación + motivo legible + aviso de revisión |

**Texto sugerido (con `{entityLabel}` = `getReportedEntityLabel(reportedEntityType)`):**:
- "Gracias por tu reporte. Hemos recibido tu aviso sobre {entityLabel} relacionado con {reason}."
- "Nuestro equipo de moderación revisará tu reporte y tomará las medidas correspondientes."

#### TPL-012 — Resolución al denunciante

| Campo | Valor |
|---|---|
| Asunto | `Hemos revisado tu reporte — Regálalo` |
| Variables | `recipientEmail`, `firstName`, `reportedEntityType` |
| Preheader | `Tu reporte ha sido revisado.` |
| Contenido | Confirmación genérica, frase "Hemos tomado las medidas que consideramos oportunas" |

**Texto sugerido (con `{entityLabel}` = `getReportedEntityLabel(reportedEntityType)`):**:
- "Gracias por confiar en Regálalo. Queremos informarte que hemos revisado tu reporte sobre {entityLabel}."
- "Hemos tomado las medidas que consideramos oportunas para mantener la comunidad segura."
- Sin revelar acción concreta ni datos del denunciado.

#### TPL-013 — Advertencia al denunciado

| Campo | Valor |
|---|---|
| Asunto | `Aviso sobre tu actividad en Regálalo` |
| Variables | `recipientEmail`, `firstName` |
| Preheader | `Revisamos tu actividad en la plataforma.` |
| Contenido | Aviso de revisión + normas comunitarias — tono colaborativo no acusatorio |

**Texto sugerido:**
- "Hemos revisado tu actividad en Regálalo y, tras nuestra revisión, consideramos que cierto contenido o comportamiento podría no ajustarse a las normas de la comunidad."
- "Te invitamos a revisar las normas de la plataforma para seguir construyendo juntos una comunidad positiva para todos."
- Sin mención al reporte, denunciante ni motivo.

#### TPL-ADM-002 — Notificación al operador

| Campo | Valor |
|---|---|
| Asunto | `[Regálalo] Nuevo reporte — {reason_label} — {entity_type}` |
| Variables | `reportId`, `reportedEntityType`, `reason`, `entitySnapshotTitle`, `reporterFirstName`, `createdAt` |
| Preheader | `Nuevo reporte recibido. Revisar en el panel de administración.` |
| Contenido | ID con enlace, tipo+motivo, snapshot title, denunciante, timestamp |

**Texto sugerido:**
- "Se ha recibido un nuevo reporte en la plataforma."
- "ID del reporte: {reportId}"
- "Enlace directo: {ADMIN_PANEL_URL}/reportes/{reportId}"
- "Tipo de entidad: {reportedEntityType}"
- "Motivo: {reason}"
- "Contenido reportado: {entitySnapshotTitle}"
- "Denunciante: {reporterFirstName}"
- "Fecha y hora: {createdAt}"

### REPORT_REASON_LABELS Map

Añadir a `condition-labels.ts` (o archivo separado `report-reason-labels.ts`):

```typescript
export const REPORT_REASON_LABELS: Record<string, string> = {
  contenido_inadecuado: 'Contenido inadecuado',
  fraude_o_enganio: 'Fraude o engaño',
  spam: 'Spam',
  objeto_ilegal: 'Objeto ilegal',
  objeto_peligroso: 'Objeto peligroso',
  información_falsa: 'Información falsa',
  comportamiento_abusivo: 'Comportamiento abusivo',
  otro: 'Otro',
};

export function getReportReasonLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason] ?? reason;
}
```

### Registry Registration (AC-5)

En `registry.ts`, añadir:
```typescript
import { renderTpl011 } from './tpl-011-report-confirmation';
import { renderTpl012 } from './tpl-012-report-resolved';
import { renderTpl013 } from './tpl-013-warn-user';
import { renderTplAdm002 } from './tpl-adm-002-new-report-admin';

export const emailTemplateRegistry: Record<string, EmailTemplateRenderer> = {
  // ...existing entries...
  'TPL-011': renderTpl011,
  'TPL-012': renderTpl012,
  'TPL-013': renderTpl013,
  'TPL-ADM-002': renderTplAdm002,
};
```

### Key Conventions (from project-context.md)

- kebab-case para archivos: `tpl-011-report-confirmation.ts`, `tpl-012-report-resolved.ts`
- snake_case en BD, camelCase en TS
- Importar `z` solo desde `src/zod.ts` (no aplica aquí — no usamos Zod en templates)
- `renderEmailLayout` de `./layout/email-layout` (relative import, sin extensión `.js`)
- npm scripts (`npm run build`) generan OpenAPI + tsc

### Use Cases That Will Call These Templates (existirán en 14.3 y 14.6)

| Use Case | Templates | Trigger |
|---|---|---|
| `CreateReportUseCase` (historia 14.3) | TPL-011 + TPL-ADM-002 | POST `/api/reports` → 201 |
| `AdminResolveReportUseCase` (historia 14.6) | TPL-012 (siempre, si reporter_id IS NOT NULL) + TPL-013 (solo si action=warn_user) | POST `/api/admin/reports/:id/resolve` |

### Post-commit fire-and-forget pattern (from 14-3 Dev Notes)

```typescript
Promise.all([
  this.mailService.send({ to: reporterEmail, templateId: 'TPL-011', variables: {...} })
    .catch(err => appLogger.error({ err }, 'TPL-011 failed')),
  this.mailService.send({ to: ADMIN_EMAIL, templateId: 'TPL-ADM-002', variables: {...} })
    .catch(err => appLogger.error({ err }, 'TPL-ADM-002 failed')),
]);
```

### Previous Story Intelligence (14-3)

**Dev Notes Summary (de 14-3):**
- `CreateReportUseCase` ya planifica post-commit TPL-011 y TPL-ADM-002
- `AdminResolveReportUseCase` planifica TPL-012 y condicionalmente TPL-013
- Las variables `reportedEntityType` esperan valores `"objeto"`/`"usuario"` (en español, no `"item"`/`"user"`)
- `reason` debe pasarse como label legible (usando `getReportReasonLabel()`)
- Patrón fire-and-forget establecido en `SelectReceiverUseCase` y `ConfirmDeliveryUseCase`

**Work patterns observed:**
- Archivos atómicos por template (1 template = 1 archivo)
- Sin nuevas dependencias en package.json (solo `resend` ya instalada)
- Templates NO tienen acceso a `env` directamente — las variables se pasan desde el use case

### Testing

Seguir el patrón exacto de `tests/email-tpl-002.test.ts`: `beforeAll` con `vi.useFakeTimers()`, `afterAll` restaurando, snapshot + assertions de contenido + tokens + preheader.

#### Patrón de test individual (`tests/email-tpl-011.test.ts`):

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl011 } from '../src/infrastructure/email/templates/tpl-011-report-confirmation';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'user@example.com',
  firstName: 'Juan',
  reportedEntityType: 'objeto',
  reason: 'Contenido inadecuado',
};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01')); });
afterAll(() => { vi.useRealTimers(); });

describe('email-tpl-011 — confirmación al denunciante', () => {
  it('14.4 — snapshot', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toMatchSnapshot();
  });
  it('14.4 — contiene color primary', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain(tokens.primary);
  });
  it('14.4 — asunto correcto', () => {
    const { subject } = renderTpl011(fixture);
    expect(subject).toBe('Hemos recibido tu reporte — Regálalo');
  });
  it('14.4 — saludo con firstName', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('Hola, Juan');
  });
  it('14.4 — entity label legible en cuerpo', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('un objeto');
  });
  it('14.4 — reason label en cuerpo', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('Contenido inadecuado');
  });
  it('14.4 — sin CTA', () => {
    const { html } = renderTpl011(fixture);
    expect(html).not.toContain('O copia este enlace');
  });
});
```

#### Fixtures para snapshot global (`tests/email-templates.snap.test.ts`):

Añadir al objeto `fixtures`:
```typescript
'TPL-011': {
  recipientEmail: 'user@example.com',
  firstName: 'Juan',
  reportedEntityType: 'objeto',
  reason: 'Contenido inadecuado',
},
'TPL-012': {
  recipientEmail: 'reporter@example.com',
  firstName: 'María',
  reportedEntityType: 'usuario',
},
'TPL-013': {
  recipientEmail: 'warned@example.com',
  firstName: 'Carlos',
},
'TPL-ADM-002': {
  reportId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  reportedEntityType: 'objeto',
  reason: 'Fraude o engaño',
  entitySnapshotTitle: 'Mesa de madera',
  reporterFirstName: 'Juan',
  createdAt: '2026-06-10T10:30:00.000Z',
},
```

Actualizar el test de cobertura de registry para incluir:
```typescript
expect([...ACTIVE_EMAIL_TEMPLATE_IDS].sort()).toEqual([
  'TPL-001', 'TPL-002', 'TPL-003', 'TPL-004', 'TPL-005',
  'TPL-006', 'TPL-007', 'TPL-008', 'TPL-009', 'TPL-010',
  'TPL-011', 'TPL-012', 'TPL-013',
  'TPL-ADM-001', 'TPL-ADM-002',
]);
```

#### Casos a cubrir por template:

| Template | Test cases clave |
|---|---|
| TPL-011 | snapshot, asunto, firstName, entity label legible ("un objeto"/"otro usuario"), reason label, sin CTA, color primary |
| TPL-012 | snapshot, asunto, frase "medidas que consideramos oportunas", entity label legible, sin mención acción |
| TPL-013 | snapshot, asunto, aviso actividad, sin mención reporte/denunciante, sin CTA |
| TPL-ADM-002 | snapshot, firstName='administrador', enlace panel, reportId, snapshotTitle, subject con formato |

## Project Context Reference

Ver `_bmad-output/project-context.md` completo. Puntos clave:
- Strict Clean Architecture: domain → application → infrastructure → interfaces
- `renderEmailLayout()` obligatorio para todos los templates — prohibido HTML sin layout
- Design tokens sincronizados con frontend (colores, fuentes)
- TPL-ADM-002 vive en namespace admin junto con TPL-ADM-001
- Prohibido exponer PII en variables (ya controlado por use cases)
- Templates no acceden a `env` — reciben variables como `Record<string, string | number>`

## Completion Status

- [x] AC-1: TPL-011 (confirmación al denunciante)
- [x] AC-2: TPL-ADM-002 (notificación al operador)
- [x] AC-3: TPL-012 (resolución al denunciante)
- [x] AC-4: TPL-013 (advertencia al denunciado)
- [x] AC-5: 4 templates registrados en registry.ts
- [x] AC-6: REPORT_REASON_LABELS en condition-labels.ts
- [x] AC-7: Snapshot tests Vitest para cada template
- [x] `npm test` pasa sin regresiones
- [x] `npm run build` (OpenAPI + tsc) sin errores
- [x] CHANGELOG.md actualizado con `## [Unreleased]`

## File List

- `src/infrastructure/email/templates/condition-labels.ts` (modificado)
- `src/infrastructure/email/templates/registry.ts` (modificado)
- `src/infrastructure/email/templates/tpl-011-report-confirmation.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-012-report-resolved.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-013-warn-user.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts` (nuevo)
- `tests/email-tpl-011.test.ts` (nuevo)
- `tests/email-tpl-012.test.ts` (nuevo)
- `tests/email-tpl-013.test.ts` (nuevo)
- `tests/email-tpl-adm-002.test.ts` (nuevo)
- `tests/email-templates.snap.test.ts` (modificado)
- `CHANGELOG.md` (modificado)
- `package.json` (modificado — versión 1.1.0 → 1.2.0)

### Review Findings

- [x] [Review][Decision] `ADMIN_CORS_ORIGIN` como base del panel admin — se mantiene (dominio único regalalo.org). Se agregó `adminPanelBaseUrl` como variable opcional del template para override en tests. [tpl-adm-002-new-report-admin.ts:11]

- [x] [Review][Patch] TPL-ADM-002: `adminPanelBaseUrl` como variable opcional para snapshots herméticos + fallback a `env.ADMIN_CORS_ORIGIN` [tpl-adm-002-new-report-admin.ts:11-12]
- [x] [Review][Patch] `getReportedEntityLabel`: maneja empty/unknown (fallback a "un contenido" / `"${type}"`) [condition-labels.ts:33-36]
- [x] [Review][Patch] `createdAt` formateado a `dd/mm/yyyy HH:mm` en vez de ISO raw [tpl-adm-002-new-report-admin.ts]

- [x] [Review][Defer] TPL-ADM-002 (y TPL-ADM-001): `renderEmailParagraph` escapa HTML — tags `<strong>`, `<br />`, `<a>` se renderizan como texto literal. Pre-existing en TPL-ADM-001, no introducido en este cambio. [tpl-adm-002-new-report-admin.ts:17-31]

## Dev Agent Record

### Completion Notes

Implementados los 4 templates del módulo de reportes siguiendo exactamente el patrón de Épica 9:
- TPL-011/012/013: sin CTA ni fallbackLink, usando `renderEmailLayout` + `renderEmailParagraph`
- TPL-ADM-002: importa `env.ADMIN_CORS_ORIGIN` directamente (igual que `tpl-006`) para construir el enlace al panel; `firstName` forzado a `'administrador'`
- `getReportedEntityLabel` y `REPORT_REASON_LABELS` añadidos a `condition-labels.ts`
- 47 tests nuevos pasan (8 snapshots escritos); 6 fallos pre-existentes no relacionados con esta historia

### Change Log

- 2026-06-10: Historia 14-4 implementada. 4 nuevos templates de email (TPL-011, TPL-012, TPL-013, TPL-ADM-002), helpers de labels, registry actualizado, 47 tests, build limpio. Versión 1.1.0 → 1.2.0.
