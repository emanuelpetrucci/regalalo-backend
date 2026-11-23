import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql',
);

describe('018-candidate-contact-channel-schema.sql — smoke tests', () => {
  let sql: string;

  beforeAll(() => {
    sql = readFileSync(MIGRATION_PATH, 'utf8');
  });

  it('12.1 — incluye columna contact_channel en item_requests', () => {
    expect(sql).toContain('item_requests');
    expect(sql).toContain('contact_channel');
  });

  it('12.1 — incluye columna receiver_contact_channel en delivery_sessions', () => {
    expect(sql).toContain('receiver_contact_channel');
  });

  it('12.1 — incluye columna receiver_contact_purged como BOOLEAN NOT NULL DEFAULT FALSE', () => {
    expect(sql).toContain('receiver_contact_purged');
    expect(sql).toContain('BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('12.1 — elimina el índice parcial anterior antes de recrearlo', () => {
    expect(sql).toContain('DROP INDEX IF EXISTS idx_sessions_contact_purge');
  });

  it('12.1 — el nuevo índice parcial cubre receiver_contact_purged = FALSE (condición OR)', () => {
    expect(sql).toContain('receiver_contact_purged = FALSE');
    expect(sql).toMatch(/contact_purged\s*=\s*FALSE\s+(OR|or)\s+receiver_contact_purged\s*=\s*FALSE/);
  });

  it('12.1 — el job purge-contact-channel establece receiver_contact_channel = NULL', () => {
    expect(sql).toContain('receiver_contact_channel = NULL');
  });

  it('12.1 — el job purge-contact-channel establece receiver_contact_purged = TRUE', () => {
    expect(sql).toMatch(/receiver_contact_purged\s+=\s+TRUE/);
  });

  it('12.1 — el WHERE del job usa condición OR sobre ambos flags de purga', () => {
    expect(sql).toMatch(/\(contact_purged\s*=\s*FALSE\s+OR\s+receiver_contact_purged\s*=\s*FALSE\)/);
  });

  it('12.1 — el job mantiene el horario 03:30 UTC diario', () => {
    expect(sql).toContain("'30 3 * * *'");
  });

  it('12.1 — el job mantiene el filtro de estados cerrados', () => {
    expect(sql).toContain("status IN ('completed', 'cancelled', 'expired')");
  });

  it('12.1 — el job mantiene la ventana de 7 días', () => {
    expect(sql).toContain("INTERVAL '7 days'");
  });

  it('12.1 — usa patrón unschedule idempotente antes de schedule', () => {
    expect(sql).toContain("PERFORM cron.unschedule('purge-contact-channel')");
    expect(sql).toContain('EXCEPTION WHEN OTHERS THEN NULL');
  });

  it('12.1 — usa ADD COLUMN IF NOT EXISTS para idempotencia', () => {
    const ifNotExistsCount = (sql.match(/ADD COLUMN IF NOT EXISTS/gi) ?? []).length;
    expect(ifNotExistsCount).toBe(3);
  });

  it('12.1 — columnas de canal tienen CHECK de longitud máxima 500 chars', () => {
    expect(sql).toContain('char_length(contact_channel) <= 500');
    expect(sql).toContain('char_length(receiver_contact_channel) <= 500');
  });

  it('12.1 — no modifica el job expire-delivery-sessions', () => {
    expect(sql).not.toContain('expire-delivery-sessions');
  });

  it('12.1 — no incluye backfill de filas pending', () => {
    expect(sql).not.toMatch(/UPDATE\s+item_requests\s+SET/i);
  });
});
