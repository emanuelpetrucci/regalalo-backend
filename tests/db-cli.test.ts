import { describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  preferIpv4DatabaseUrl,
  buildSupabaseSessionPoolerUrls,
  supabaseSessionPoolerCandidates,
} from '../scripts/lib/pg-tools';
import {
  buildBackupFilename,
  buildRemoteBackupKey,
  formatBackupTimestamp,
  getRestoreExtension,
  isSupportedRestoreExtension,
  parseRestoreFileArg,
  requireEnv,
  resolveRestoreFile,
} from '../scripts/lib/db-cli';

describe('db-cli helpers', () => {
  it('formatea timestamp sin caracteres inválidos en rutas', () => {
    const timestamp = formatBackupTimestamp(new Date('2026-06-18T14:05:20.123Z'));
    expect(timestamp).toBe('2026-06-18T14-05-20');
  });

  it('genera nombre de backup con timestamp', () => {
    expect(buildBackupFilename('2026-06-18T14-05-20')).toBe('backup-2026-06-18T14-05-20.dump');
  });

  it('genera key remota bajo prefijo backups/', () => {
    expect(buildRemoteBackupKey('backup-2026-06-18T14-05-20.dump')).toBe(
      'backups/backup-2026-06-18T14-05-20.dump',
    );
  });

  it('parsea --file desde argv', () => {
    expect(parseRestoreFileArg(['--file', '.bk/backup.dump'])).toBe('.bk/backup.dump');
    expect(parseRestoreFileArg(['--file=.bk/backup.dump'])).toBe('.bk/backup.dump');
    expect(parseRestoreFileArg(['.bk/backup.dump'])).toBe('.bk/backup.dump');
    expect(parseRestoreFileArg(['--other'])).toBeNull();
  });

  it('resolveRestoreFile prioriza DB_RESTORE_FILE', () => {
    const previous = process.env['DB_RESTORE_FILE'];
    process.env['DB_RESTORE_FILE'] = '.bk/from-env.dump';
    expect(resolveRestoreFile([])).toBe('.bk/from-env.dump');
    if (previous === undefined) {
      delete process.env['DB_RESTORE_FILE'];
    } else {
      process.env['DB_RESTORE_FILE'] = previous;
    }
  });

  it('valida extensiones soportadas de restore', () => {
    expect(getRestoreExtension('/tmp/backup.DUMP')).toBe('.dump');
    expect(isSupportedRestoreExtension('.dump')).toBe(true);
    expect(isSupportedRestoreExtension('.sql')).toBe(true);
    expect(isSupportedRestoreExtension('.backup')).toBe(true);
    expect(isSupportedRestoreExtension('.zip')).toBe(false);
  });

  it('requireEnv falla con mensaje explícito si faltan variables', () => {
    const previous = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];

    expect(() => requireEnv(['DATABASE_URL'])).toThrow(
      'Faltan variables de entorno requeridas: DATABASE_URL',
    );

    if (previous !== undefined) {
      process.env['DATABASE_URL'] = previous;
    }
  });

  it('detecta Docker cuando está instalado', () => {
    expect(typeof isDockerAvailable()).toBe('boolean');
  });

  it('preferIpv4DatabaseUrl conserva URL si no puede resolver', async () => {
    const url = 'postgresql://user:pass@invalid-host-that-does-not-exist.example:5432/postgres';
    await expect(preferIpv4DatabaseUrl(url)).resolves.toBe(url);
  });

  it('buildSupabaseSessionPoolerUrls genera candidatos por región', () => {
    const urls = buildSupabaseSessionPoolerUrls(
      'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres',
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('postgres.abcdefgh:secret@aws-1-eu-central-1.pooler.supabase.com');
    expect(urls.some((url) => url.includes('.pooler.supabase.com:5432/postgres'))).toBe(true);
  });

  it('supabaseSessionPoolerCandidates solo propone el Session pooler si el host es IPv6', () => {
    const url = 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres';
    expect(supabaseSessionPoolerCandidates(url, 'ipv4')).toBeNull();
    expect(supabaseSessionPoolerCandidates(url, 'unknown')).toBeNull();

    const candidates = supabaseSessionPoolerCandidates(url, 'ipv6-only');
    expect(candidates?.[0]).toContain('aws-1-eu-central-1.pooler.supabase.com:5432/postgres');
    expect(candidates?.some((candidate) => candidate.includes(':6543'))).toBe(false);
    expect(candidates?.some((candidate) => candidate.includes('db.abcdefgh.supabase.co'))).toBe(false);
  });

  it('preferIpv4DatabaseUrl reemplaza host por IPv4', async () => {
    const url = 'postgresql://user:pass@dns.google:5432/postgres';
    const resolved = await preferIpv4DatabaseUrl(url);
    expect(resolved).toMatch(/^postgresql:\/\/user:pass@\d{1,3}(\.\d{1,3}){3}:5432\/postgres$/);
    expect(resolved).not.toContain('dns.google');
  });
});
