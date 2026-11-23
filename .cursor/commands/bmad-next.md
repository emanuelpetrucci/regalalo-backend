---
description: Ejecuta el siguiente paso del ciclo BMad v7 según el árbol de tickets
---

# bmad-next

Ejecuta el siguiente paso del ciclo **BMad v7** según el árbol de tickets.

1. Leé `_bmad/custom/config.user.toml` → `active_initiative` (debe ser `initiative-backend`).
2. Ejecutá:
   - `uv run _bmad/method/scripts/tickets.py --project-root . status initiative-backend`
   - `uv run _bmad/method/scripts/tickets.py --project-root . next initiative-backend`
3. Delegá al agente **bmad-sprint-orchestrator** (`.cursor/agents/bmad-sprint-orchestrator.md`), que lanza **un** skill v7.

Si el usuario escribió argumentos después del comando, respetalos:

- `status` — solo resumen de `tickets.py`, sin delegar
- `N pasos` — hasta N delegaciones secuenciales (máx 3 si no especifica N)

No uses `sprint-status.yaml` ni `_bmad-output/implementation-artifacts/` (v6, archivado en `initiative-backend/archive-v6/`).
