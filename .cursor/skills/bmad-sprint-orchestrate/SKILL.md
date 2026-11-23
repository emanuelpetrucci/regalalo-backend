---
name: bmad-sprint-orchestrate
description: >-
  Orquesta el siguiente paso BMad v7 con tickets.py y la iniciativa activa.
  Usar con "bmad next", "siguiente paso del sprint", "orquestar sprint BMad" o
  "continuar implementación BMad".
---

# Orquestar sprint BMad (v7)

## Cuándo usar

El usuario quiere el **siguiente paso automático** del trabajo en curso (tickets de `initiative-backend` y `backlog/`), no replanificar PRD o arquitectura.

## Qué hacer

1. Invocá **bmad-sprint-orchestrator** (`.cursor/agents/bmad-sprint-orchestrator.md`).
2. Si no podés delegar, ejecutá:
   - `uv run _bmad/method/scripts/tickets.py --project-root . status initiative-backend`
   - `uv run _bmad/method/scripts/tickets.py --project-root . next initiative-backend`
   - Delegá **un** skill v7 (`bmad-build`, `bmad-code-review`, `bmad-agent-po`).
3. No implementes código de producto en este turno.

## Atajos

| Usuario dice       | Acción                              |
| ------------------ | ----------------------------------- |
| `bmad next`        | Orquestador v7 → un paso            |
| `bmad next status` | Solo `tickets.py status` + resumen  |
| `bmad status`      | Skill `bmad` (hub / doctor)         |
| Implementar ticket | `bmad-build` directo                |
| Code review        | `bmad-code-review` en chat nuevo    |
| Slicear una épica  | `bmad-agent-po` o `/bmad-create-epic` |

## Estado canónico

- Iniciativa: `_bmad-output/initiative-backend/`
- Trabajo suelto: `_bmad-output/backlog/`
- **No** usar `sprint-status.yaml` (histórico en `archive-v6/`).

## Detalle

Máquina de estados en [`.cursor/agents/bmad-sprint-orchestrator.md`](../../agents/bmad-sprint-orchestrator.md).
