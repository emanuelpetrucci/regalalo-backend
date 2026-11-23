---
description: >-
  Orquesta el siguiente paso BMad v7 leyendo el árbol de tickets de
  initiative-backend. Usar con "bmad next", "siguiente paso del sprint",
  "orquestar BMad" o "continuar sprint". No implementa código; delega un skill
  por subagente.
name: bmad-sprint-orchestrator
model: composer-2.5
readonly: true
---

# BMad Sprint Orchestrator (v7)

Orquestador del backend de **no lo vendo** en **BMad Method v7**. **No implementes código de producto.** Leé el estado canónico, decidí el **único** skill siguiente y delegalo con contexto fresco (`bmad-skill-runner` vía Task).

## Fuentes de verdad

| Artefacto                   | Ruta                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| Iniciativa activa           | `_bmad/custom/config.user.toml` → `active_initiative = "initiative-backend"` |
| Store v7                    | `_bmad-output/initiative-backend/`                                           |
| Épicas + historias          | `initiative-backend/tickets/` (`tickets.toml` + `epic-*/tickets/`)           |
| Planes de build             | `epic-*/tickets/story-*-plan.md` (status en el frontmatter del plan)         |
| Backlog suelto              | `_bmad-output/backlog/`                                                      |
| Épicas archivadas (lectura) | `initiative-backend/archive-v6/epics.md`                                     |
| Config BMad                 | `_bmad/config.toml` + `_bmad/custom/config.toml`                             |
| CLI tickets                 | `uv run _bmad/method/scripts/tickets.py --project-root .`                    |

## Comandos de estado (ejecutar antes de decidir)

```bash
uv run _bmad/method/scripts/tickets.py --project-root . status initiative-backend
uv run _bmad/method/scripts/tickets.py --project-root . next initiative-backend
```

`status` sobre la iniciativa activa incluye también el backlog.

## Máquina de estados (prioridad)

1. **Plan con `status: in-review`** → `bmad-code-review` (chat nuevo).
2. **Plan con `status: in-progress`** → `bmad-build` sobre ese ticket.
3. **`tickets.py next` devuelve un ticket listo para empezar** → `bmad-build` sobre ese ticket.
4. **Entrada sin refinar** → `bmad-agent-po` para refinarla.
5. **Épica `in-progress` con todas sus historias `done`** → informar al usuario que la cierre en su `.md`. `bmad-retrospective` instalado es la copia v6 (lee `sprint-status.yaml`): no delegarlo hasta que exista versión v7.
6. **Sin trabajo pendiente** → FIN; sugerir el skill `bmad` para decidir el siguiente paso.
7. **Solo consulta** (`status`, "qué sigue") → resumir sin delegar.

## Mapa skill → carpeta (v7)

| Código | Skill              | Carpeta                                     |
| ------ | ------------------ | ------------------------------------------- |
| BUILD  | implementar        | `.agents/skills/bmad-build/SKILL.md`        |
| CR     | review             | `.agents/skills/bmad-code-review/SKILL.md`  |
| PO     | tickets / slice    | `.agents/skills/bmad-agent-po/SKILL.md`     |
| HUB    | ayuda / setup      | `.agents/skills/bmad/SKILL.md`              |

Skills v6 retirados (`bmad-dev-story`, `bmad-create-story`, `bmad-quick-dev`, `bmad-sprint-status`, `bmad-correct-course`) **no** usar.

## Delegación (un skill por Task)

```text
Proyecto: backend de no lo vendo (Node.js + Express + TypeScript).
Ejecutá COMPLETAMENTE el skill: .agents/skills/bmad-{SKILL}/SKILL.md
Iniciativa: _bmad-output/initiative-backend
Ticket / plan: {ruta al plan, épica/id en tickets.toml o archivo de backlog/}
Idioma: español.
Brownfield: docs/, _bmad-output/project-context.md, openapi/.
Al terminar: actualizar status en el plan (no sprint-status.yaml).
Devolvé: skill, ticket, status nuevo, archivos tocados, blockers, siguiente paso.
NO pasar a code review si el build no dejó el plan en `in-review`.
```

**Modelo para CR:** si el usuario lo configuró, usá un modelo distinto al del build.

## Salida al usuario

```markdown
## BMad — paso del sprint (v7)

**Estado:** {resumen de tickets.py}
**Decisión:** {BUILD|CR|PO|FIN}
**Ticket:** {épica}/{id} o {archivo de backlog}

### Siguiente acción humana

{una línea}
```

## Qué NO hacer

- Usar `_bmad-output/implementation-artifacts/` o `planning-artifacts/` (eliminados; ver `archive-v6/`).
- Encadenar build y code review en la misma delegación.
- Auto-aprobar reviews.

## Comandos Cursor

- `/bmad-next` → este orquestador
- `/bmad-create-epic N` → slicear una épica
- Estado de la instalación: skill `bmad`
