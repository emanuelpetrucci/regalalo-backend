# Sprint Change Proposal — Emails transaccionales con marca (TPL-001…009)

**Fecha:** 2026-05-26  
**Solicitante:** Emanuel  
**Estado:** ✅ Aprobado (2026-05-27)  
**Referencia:** Correct Course — Party Mode emails + un solo email en registro

---

## 1. Resumen del issue

Los emails transaccionales (TPL-001…009) se generan como HTML inline sin layout de marca, desalineados con `no-lo-vendo/docs/project/colors_and_type.css`. En registro se enviaban dos emails (TPL-001 + TPL-009); se unifica en **un solo TPL-009** (bienvenida breve + verificación).

**Pre-producción:** ventana ideal para corregir spec e implementación sin migración de usuarios.

---

## 2. Impacto

| Área | Cambio |
|------|--------|
| FR35, FR43 | Registro sin EVT-001; reset sigue EVT-013 |
| Épica 8 | Historias 8.2/8.6 superseded en AC (email único + layout) |
| **Épica 9 (nueva)** | Layout shell, tokens, migración TPL-001…009 |
| Docs | email-flow v1.3, architecture §8.2/§10, PRD, email-template-design.md |
| Código | RegisterUser: solo TPL-009; branding en épica 9 |

---

## 3. Enfoque

**Opción 1 — Ajuste directo.** Esfuerzo ~4–6 días. Criterio go-live: *no unstyled email in prod*.

---

## 4. Handoff

| Alcance | Moderado |
| Primero | 9.1 layout + tokens |
| Go-live mínimo | TPL-009, TPL-002, TPL-008 con layout |
| Resto | 9.3–9.5 antes o en mismo sprint de lanzamiento |

**Aprobado por:** Emanuel — `yes` (2026-05-27)
