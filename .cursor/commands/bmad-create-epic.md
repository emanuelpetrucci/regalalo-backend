---
description: Crea o slicea las entradas de una épica en el árbol de tickets v7
---

# bmad-create-epic (v7)

En **BMad v7** no existe el batch `bmad-create-story` sobre `sprint-status.yaml`.

## Qué hacer

1. Indicá la épica (número o slug, ej. `13`, `epic-panel-administrativo-backend-prd-adm-be-01`).
2. Usá el skill **`bmad-agent-po`** para crear, refinar o slicear sus entradas, o editá a mano:
   - `_bmad-output/initiative-backend/tickets/tickets.toml` (lista de épicas)
   - `_bmad-output/initiative-backend/tickets/epic-<slug>/tickets/tickets.toml` (entradas de la épica)
3. Implementá cada entrada con **`bmad-build`** (o `/bmad-next`).

Referencia histórica: `_bmad-output/initiative-backend/archive-v6/epics.md`.
