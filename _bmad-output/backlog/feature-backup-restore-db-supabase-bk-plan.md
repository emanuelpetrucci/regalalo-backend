---
title: 'Backup y restore manual de base de datos con copia local y bucket bk'
type: feature
created: 2026-10-25
status: done
baseline_commit: '6f3ba83c6d6e58aca2b22e2202f50b35a7c0aa45'
context:
  - '{project-root}/_bmad-output/project-context.md'
ticket: "story-backup-restore-db-supabase-bk"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hoy no existe un flujo manual estándar para respaldar la base de datos desde `package.json`, guardar una copia local fuera de git y subir el dump a Supabase Storage, lo que dificulta recuperación y trazabilidad operativa.

**Approach:** Incorporar dos scripts CLI en TypeScript (`db:backup` y `db:restore`) ejecutables por npm, que generen/restauren dumps PostgreSQL usando herramientas nativas (`pg_dump`/`pg_restore` o `psql`), persistan el archivo localmente en una carpeta ignorada por git y, para backup, suban el artefacto al bucket `bk` en Supabase.

## Boundaries & Constraints

**Always:** usar `DATABASE_URL` como fuente de conexión; usar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para Storage; guardar backups en una carpeta local dedicada ignorada por git; nombrar archivos con timestamp para evitar colisiones; fallar explícitamente ante variables faltantes, errores de dump/upload/restore o archivo inexistente; exponer comandos desde `package.json` para ejecución manual.

**Ask First:** cambiar el formato de dump (custom/binario vs plain SQL), automatizar por cron, o modificar esquema/migraciones existentes como parte de este trabajo.

**Never:** usar ORM o reescribir acceso de datos de la app; versionar archivos de backup en el repositorio; silenciar errores de CLI con catches vacíos; depender de rutas hardcodeadas no configurables sin defaults razonables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backup manual exitoso | `npm run db:backup` con `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; bucket `bk` existente | Se crea dump en carpeta local ignorada por git y se sube el mismo archivo al bucket `bk`; se imprime ruta local y key remota | N/A |
| Restore manual exitoso (archivo local) | `npm run db:restore -- --file <ruta_dump>` con conectividad DB | Se ejecuta restore completo contra `DATABASE_URL` y finaliza con estado exitoso | N/A |
| Falta de variables críticas | Falta una o más env requeridas para backup/restore | El proceso termina con código no-cero y mensaje claro de variable faltante | Error explícito sin fallback |
| Archivo de restore inválido/no existe | `--file` apunta a ruta inexistente o extensión no soportada | No se inicia restore, se informa causa y finaliza con error | Error explícito sin ejecutar comandos destructivos |
| Falla subida a Supabase | Dump local generado pero `storage.from('bk').upload(...)` devuelve error | Backup se reporta como fallido; el archivo local se conserva para recuperación manual | Propagar mensaje de error de Storage y terminar con código no-cero |

</frozen-after-approval>

## Code Map

- `package.json` -- punto de entrada para scripts manuales `db:backup` y `db:restore`.
- `scripts/db-backup.ts` -- orquesta dump PostgreSQL, persistencia local y upload al bucket `bk`.
- `scripts/db-restore.ts` -- valida input y ejecuta restore contra `DATABASE_URL`.
- `.gitignore` -- excluye la carpeta local de backups del control de versiones.
- `scripts/seed.ts` -- referencia de patrón existente para carga de env, manejo de Supabase client y estilo de scripts CLI.
- `src/config/load-env.ts` -- mecanismo estándar del repo para resolver `.env.<APP_ENV>`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/db-backup.ts` -- crear script CLI manual que cargue env, valide requeridos, cree carpeta local de backups, ejecute dump y suba al bucket `bk` -- habilita respaldo operativo replicable.
- [x] `scripts/db-restore.ts` -- crear script CLI manual que reciba ruta de dump, valide existencia/tipo y ejecute restore a la DB objetivo -- habilita recuperación controlada.
- [x] `package.json` -- agregar scripts `db:backup` y `db:restore` -- permite ejecución estándar por npm sin comandos ad-hoc.
- [x] `.gitignore` -- agregar carpeta local de backups (por ejemplo `.bk/`) -- evita versionar artefactos pesados/sensibles.
- [x] `scripts/db-backup.ts` y `scripts/db-restore.ts` -- incluir salida de consola clara (archivo generado, key remota, comando aplicado) y códigos de error coherentes -- mejora operabilidad manual.

**Acceptance Criteria:**
- Given un entorno con variables requeridas y bucket `bk` accesible, when ejecuto `npm run db:backup`, then se genera un archivo de backup local en la carpeta ignorada por git y se sube exitosamente al bucket `bk`.
- Given un backup local válido, when ejecuto `npm run db:restore -- --file <ruta>`, then la base de datos destino se restaura y el comando termina exitosamente.
- Given que falta `DATABASE_URL` o credenciales de Supabase para backup, when ejecuto los scripts, then el proceso falla con mensaje explícito y código no-cero.
- Given que el archivo de restore no existe, when intento restaurar, then el script aborta antes de tocar la base de datos e informa el error.
- Given el repositorio actualizado, when reviso el árbol de trabajo y el control de versiones, then la carpeta local de backups queda ignorada por git.

## Spec Change Log

- 2026-06-18: Implementación de scripts `db:backup` / `db:restore`, utilidades compartidas y tests unitarios.
- 2026-10-27: Decisión de review (1): `main` exportado con guard de invocación directa y tests de orquestación con mocks.

## Dev Agent Record

### Implementation Plan

- Formato de dump: **custom** (`pg_dump -Fc`) con extensión `.dump` para restore robusto vía `pg_restore`.
- Restore también soporta `.sql` (plain) vía `psql` y `.backup` (custom) vía `pg_restore`.
- Carpeta local por defecto `.bk/` (configurable con `DB_BACKUP_DIR`); upload remoto a `bk/backups/<filename>`.
- Validación de env y argumentos antes de ejecutar comandos destructivos.

### Debug Log

- Suite completa: 5 fallos preexistentes en geocoding/Nominatim (no relacionados con esta story). `tests/db-cli.test.ts` pasa 6/6.

### Completion Notes

- ✅ `scripts/db-backup.ts`: carga env, valida `DATABASE_URL` + credenciales Supabase, ejecuta `pg_dump`, conserva copia local y sube a bucket `bk`.
- ✅ `scripts/db-restore.ts`: valida `--file`, extensión y existencia antes de `pg_restore`/`psql`.
- ✅ `package.json`: `db:backup`, `db:backup:dev`, `db:backup:prod`, `db:restore`, `db:restore:dev`, `db:restore:prod`.
- ✅ `.gitignore`: carpeta `.bk/` excluida.
- ✅ Tests unitarios en `tests/db-cli.test.ts` para helpers de naming, parsing y validación de env.
- ✅ 2026-10-27: `main` exportado en `db-backup.ts` y `db-restore.ts` (solo corre si el proceso es el script). Tests de orquestación en `tests/db-backup-restore.test.ts` (pg_dump, upload a `bk`, pg_restore/psql con URL resuelta, abortar sin tocar la DB).

## File List

- `scripts/lib/db-cli.ts` (nuevo)
- `scripts/db-backup.ts` (nuevo)
- `scripts/db-restore.ts` (nuevo)
- `tests/db-cli.test.ts` (nuevo)
- `tests/db-backup-restore.test.ts` (nuevo)
- `package.json` (modificado)
- `.gitignore` (modificado)

## Status

done

## Design Notes

Se usa una carpeta local dedicada (propuesta: `.bk/`) como fuente inmediata de recuperación y auditoría operativa. El upload remoto a `bk` se hace después de confirmar la creación local para preservar una copia utilizable aun si falla Storage.

Los comandos de dump/restore se resuelven con utilidades nativas de PostgreSQL porque son el mecanismo más robusto para backups completos sin introducir dependencias de ORM ni lógica SQL parcial en Node.

## Verification

**Commands:**
- `npm run db:backup` -- expected: crea dump local y reporta upload exitoso a `bk`.
- `npm run db:restore -- --file <archivo_generado>` -- expected: restore exitoso con salida de confirmación.

## Code Review

### 2026-10-27

**Code review complete.** 1 decision-needed, 1 patch (aplicado), 0 defer, 3 rejected.

- [x] [Review][Decision] Cobertura automatizada de scripts `db:backup` / `db:restore` — Elegida opción (1) el 2026-10-27. `main` exportado con guard `import.meta` y tests con `vi.mock` de `runPgTool`/Supabase en `tests/db-backup-restore.test.ts`.

- [x] [Review][Patch] `pg_restore` debe usar la misma URL resuelta que `psql` (Session pooler / IPv4) [scripts/db-restore.ts:59-73] — aplicado en esta review.

**Rejected**

- `false`: La rama `psql` ya resolvía URL; solo `pg_restore` estaba inconsistente — corregido, no queda defecto abierto en ese punto.
- `low`: `upload` lee el dump completo en memoria — aceptable para backups manuales típicos; streaming sería complejidad extra no pedida en el intent.
- `low`: Colisión de timestamp en el mismo segundo con `upsert: false` en Storage — ventana mínima; re-ejecutar al segundo siguiente es workaround trivial.

### 2026-10-27 (pasada 2)

**Code review complete.** 0 decision-needed, 0 patch, 0 defer, 4 rejected.

Enfoque: delta de export de `main`, guard `isInvokedDirectly` / `import.meta.url`, y `tests/db-backup-restore.test.ts` (opción de cobertura 1 ya implementada). Diff acotado al File List del plan (~782 líneas).

**Rejected**

- `false`: Falta test de orquestación para extensión `.backup` — misma rama que `.dump` en `db-restore.ts` (pg_restore); el test de `.dump` ya fija ese contrato.
- `low`: `requireEnv` acepta valores solo-whitespace — patrón genérico del helper, fuera del delta de esta pasada; no justifica patch en esta story.
- `low`: Dump parcial en disco si `pg_dump` falla tras `mkdir` — operación manual; el operador ve el error de CLI y puede borrar el archivo.
- `low`: Buffer completo en memoria al subir a Storage — ya rechazado en pasada 1; aceptable para backups manuales.

