---
name: bmad-create-epic-stories
description: >-
  Crear o slicear las historias de una épica en BMad v7: usar bmad-agent-po o
  editar tickets.toml. Usar con "crear todas las stories de la épica N",
  "bmad create epic N" o /bmad-create-epic.
---

# Crear stories de una épica (v7)

En **BMad v7** no hay batch `bmad-create-story`.

1. Para contexto histórico, leé la épica en `initiative-backend/archive-v6/epics.md`.
2. Usá **`bmad-agent-po`**, o añadí `[[entry]]` en `initiative-backend/tickets/epic-<slug>/tickets/tickets.toml`.
3. Implementá con **`bmad-build`** (o `/bmad-next`).

Ver [`.cursor/commands/bmad-create-epic.md`](../../commands/bmad-create-epic.md).
