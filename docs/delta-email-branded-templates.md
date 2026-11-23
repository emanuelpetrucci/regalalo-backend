# Delta — Emails transaccionales con marca + registro unificado

**Versión base:** email-flow v1.2, architecture §8.2/§10  
**Versión resultante:** email-flow v1.3, Épica 9  
**Estado:** Aprobado e incorporado (Correct Course 2026-05-27)  
**Motivo:** Alinear emails con design system frontend; un solo email en registro

---

## Cambios incorporados

| Artefacto | Cambio |
|-----------|--------|
| `docs/email-flow-mapping.md` | v1.3 — RegisterUser solo TPL-009; EVT-001 en catálogo |
| `docs/email-template-design.md` | **Nuevo** — spec visual y tiers de migración |
| `docs/architecture.md` | §8.2 un envío; §10 layout compartido |
| `docs/prd.md` | Sección emails transaccionales (marca) |
| `epics.md` | FR35, FR43, historias 8.2/8.6, **Épica 9** (9.1–9.5) |
| `sprint-status.yaml` | Épica 9 en backlog; épica 8 → done |
| `register-user.use-case.ts` | Elimina envío TPL-001 |
| Tests auth | Registro = 1 email TPL-009 |

## Pendiente de implementación (Épica 9)

- `renderEmailLayout()` y tokens en `src/infrastructure/email/`
- Migración visual TPL-001…009
- Criterio go-live: *no unstyled email in prod*
