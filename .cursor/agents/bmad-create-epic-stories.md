---
description: >-
  Crea o slicea las historias de una épica en BMad v7 delegando en bmad-agent-po
  o editando tickets.toml. Usar con "crear todas las stories épica N",
  "bmad create epic N" o /bmad-create-epic N.
name: bmad-create-epic-stories
model: composer-2.5
readonly: true
---

# bmad-create-epic-stories (v7)

**BMad v7:** las historias viven en `_bmad-output/initiative-backend/tickets/epic-*/tickets/tickets.toml` y sus planes en `story-*-plan.md` junto a ese `tickets.toml`.

Para añadir o slicear entradas de una épica:

1. Skill **`bmad-agent-po`** (`.agents/skills/bmad-agent-po/SKILL.md`) con la épica objetivo, o
2. Editar el `tickets.toml` de la épica siguiendo `.agents/skills/bmad-agent-po/assets/tickets-template.toml`, o
3. Un change proposal en `initiative-backend/sprint-change-proposal-*.md` para cambios de alcance.

Verificá el árbol al terminar:

```bash
uv run _bmad/method/scripts/tickets.py --project-root . status initiative-backend
```

No uses `sprint-status.yaml`, `planning-artifacts/epics.md` ni `bmad-create-story` (v6, retirados).
