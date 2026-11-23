# email-template-design.md

**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Estado:** Aprobado (Correct Course 2026-05-26)  
**Fuente visual:** `no-lo-vendo/docs/project/colors_and_type.css`

---

## 1. Objetivo

Definir la presentación HTML compartida de **todos** los emails transaccionales (TPL-001…TPL-010) enviados vía Resend, alineada con la marca del producto Angular.

**Criterio de lanzamiento:** ningún email en producción sin pasar por `renderEmailLayout()`.

---

## 2. Tokens de email (sync manual)

Valores literales en `src/infrastructure/email/tokens/email-design-tokens.ts`:

| Token | Valor | Origen CSS |
|-------|-------|------------|
| `primary` | `#3A7358` | `--color-primary-500` |
| `accent` | `#253F72` | `--color-accent-500` |
| `background` | `#F4F5F6` | `--color-neutral-50` |
| `surface` | `#FFFFFF` | `--color-neutral-0` |
| `textPrimary` | `#14171A` | `--fg-primary` |
| `textSecondary` | `#606A76` | `--fg-secondary` |
| `textMuted` | `#7C8692` | `--fg-muted` |
| `border` | `#D5D9DE` | `--color-neutral-200` |

**Tipografías (web-safe stack):**

- Titular: `'Playfair Display', Georgia, serif`
- Cuerpo / UI: `'DM Sans', Arial, Helvetica, sans-serif`

---

## 3. Layout compartido (`renderEmailLayout`)

Estructura table-based, ancho máximo **600px**, estilos **inline** únicamente.

| Zona | Contenido |
|------|-----------|
| Preheader | Una línea; visible en preview del cliente |
| Header | Logo + nombre «Regálalo» sobre fondo stone |
| Saludo | `Hola, {firstName}` |
| Titular | Playfair, una línea por escena |
| Cuerpo | 1–2 párrafos DM Sans |
| CTA primario | Botón `#3A7358`, texto blanco, altura ~44px |
| Fallback | URL en texto secundario bajo el botón |
| Footer | «¿No creaste esta cuenta?», enlace soporte, copyright |

Cada plantilla TPL-xxx aporta solo: asunto, preheader, titular, cuerpo, CTA (label + href).

---

## 4. Plantillas y prioridad de migración

| Tier | TPL | Evento | Notas |
|------|-----|--------|-------|
| P0 | TPL-009 | EVT-014 registro / reenvío | Bienvenida breve + CTA verificación; **único email en registro** |
| P1 | TPL-002 | EVT-002 reset | CTA «Restablecer contraseña» |
| P1 | TPL-008 | EVT-013 confirmación reset | Sin CTA o CTA a login |
| P2 | TPL-003 | EVT-003 receptor elegido | CTA a la app |
| P2 | TPL-004 | EVT-004 sesión expirada | |
| P2 | TPL-005 | EVT-005 cancelación | |
| P2 | TPL-006 | EVT-006 nueva solicitud | |
| P3 | TPL-007 | EVT-012 objeto con tiempo publicado sin receptor | Tono: «más abajo en el tablón», sin «degradado» ni IDs |
| P2 | TPL-010 | EVT-015 digest horario objetos cercanos | Lista de objetos + CTA «Explorar objetos» |
| Catálogo | TPL-001 | EVT-001 | Reservado; **no** se dispara en `RegisterUser` |

---

## 5. TPL-009 — copy de referencia (registro)

| Campo | Valor sugerido |
|-------|----------------|
| Asunto | Confirmá tu email y empezá en Regálalo |
| Preheader | Un click y ya podés publicar, pedir o regalar lo que no vendés. |
| CTA | Confirmar mi email |
| Expiración | Este enlace vence en 24 horas. |

Reenvío: mismo layout; asunto opcional «Reenviamos tu enlace de verificación».

---

## 5b. TPL-010 — copy de referencia (digest horario, EVT-015)

Dirección de diseño: **C — Rica recomendada** (`_bmad-output/initiative-backend/ux-design-specification/ux-design-directions-email.html`).

| Campo | Valor sugerido |
|-------|----------------|
| Asunto | Nuevos objetos disponibles cerca tuyo |
| Preheader | Objetos nuevos cerca tuyo — mirá el resumen y explorá en la app. |
| Titular (H1) | Nuevos objetos disponibles cerca tuyo |
| Párrafo intro | Hay {N} objeto(s) nuevo(s) disponible(s) cerca tuyo en la última hora. Entrá a explorar y pedí el que te interese. |
| CTA | Explorar objetos → `{appUrl}/explore` |
| Meta por fila | `{Estado}` · ~{distanceKm} km de vos (voseo; estado vía `CONDITION_LABELS`) |
| Thumb | 64×64 px; `alt` = título del objeto; bloque omitido si no hay `imageUrl` |

**Voz:** voseo rioplatense en asunto, titular y cuerpo (sin mezclar «ti»).

**Contador:** el párrafo intro usa `items.length` tras parsear `itemsJson`, no `itemCount` del payload.

---

## 6. Accesibilidad y clientes

- Contraste WCAG AA en CTA y texto.
- Un `<h1>` por email; enlaces descriptivos (no «click aquí»).
- Versión **texto plano** espejo del HTML.
- Smoke manual: Gmail web, Outlook web, cliente móvil.

---

## 7. Implementación

```
src/infrastructure/email/
├── tokens/email-design-tokens.ts
├── templates/
│   ├── layout/email-layout.ts
│   ├── components/{button,heading,paragraph,footer}.ts
│   ├── tpl-001-welcome.ts … tpl-009-email-verification.ts
│   ├── registry.ts              → mapa templateId → render
│   ├── escape-html.ts
│   └── index.ts
└── resend.provider.ts           → lookup en registry + resend.emails.send
```

`ResendMailProvider` delega el HTML al registry; un `templateId` desconocido lanza error (no se envía email sin layout).

Tests: `tests/email-layout.test.ts`, `tests/email-tpl-00x.test.ts`, `tests/email-templates.snap.test.ts` (parametrizado vía registry).

---

## 8. Referencias

- `docs/email-flow-mapping.md` v1.3
- `docs/architecture.md` §10
- `_bmad-output/initiative-backend/archive-v6/epics.md` — Épica 9
