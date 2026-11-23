import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 128 })),
  readFile: vi.fn(async () => Buffer.from('dump-bytes')),
  access: vi.fn(async () => undefined),
}));

const runPgTool = vi.hoisted(() => vi.fn(async () => undefined));
const resolveDatabaseUrlForPgTools = vi.hoisted(() =>
  vi.fn(async () => 'postgresql://pooler.example:5432/postgres'),
);

const upload = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const from = vi.hoisted(() => vi.fn(() => ({ upload })));
const createClient = vi.hoisted(() =>
  vi.fn(() => ({
    storage: { from },
  })),
);

vi.mock('fs/promises', () => ({
  ...fsMock,
  default: fsMock,
}));

vi.mock('../src/config/load-env', () => ({}));

vi.mock('../scripts/lib/pg-tools', () => ({
  runPgTool,
  resolveDatabaseUrlForPgTools,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

import { main as backupMain } from '../scripts/db-backup';
import { main as restoreMain } from '../scripts/db-restore';

const RESOLVED_URL = 'postgresql://pooler.example:5432/postgres';
const RAW_URL = 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres';

function stubExit(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? ''}`);
  }) as typeof process.exit);
}

describe('db:backup orquestación', () => {
  const previousEnv = {
    DATABASE_URL: process.env['DATABASE_URL'],
    SUPABASE_URL: process.env['SUPABASE_URL'],
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    DB_BACKUP_DIR: process.env['DB_BACKUP_DIR'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-18T14:05:20.123Z'));
    process.env['DATABASE_URL'] = RAW_URL;
    process.env['SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
    process.env['DB_BACKUP_DIR'] = 'tmp-db-backup-test';
    resolveDatabaseUrlForPgTools.mockResolvedValue(RESOLVED_URL);
    upload.mockResolvedValue({ error: null });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(console.log).mockRestore();
    vi.mocked(console.error).mockRestore();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('ejecuta pg_dump con la URL resuelta y sube el dump al bucket bk', async () => {
    await backupMain();

    const backupDir = path.resolve('tmp-db-backup-test');
    const filename = 'backup-2026-06-18T14-05-20.dump';
    const localPath = path.join(backupDir, filename);

    expect(resolveDatabaseUrlForPgTools).toHaveBeenCalledWith(RAW_URL);
    expect(fsMock.mkdir).toHaveBeenCalledWith(backupDir, { recursive: true });
    expect(runPgTool).toHaveBeenCalledWith({
      tool: 'pg_dump',
      mountDir: backupDir,
      env: { DATABASE_URL: RESOLVED_URL },
      args: ['--dbname', RESOLVED_URL, '--format', 'custom', '--file', localPath, '--no-owner', '--no-acl'],
    });
    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-service-role-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(from).toHaveBeenCalledWith('bk');
    expect(upload).toHaveBeenCalledWith(`backups/${filename}`, Buffer.from('dump-bytes'), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    expect(runPgTool.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]!);
  });

  it('no llama a pg_dump ni a Storage si faltan variables', async () => {
    delete process.env['DATABASE_URL'];

    await expect(backupMain()).rejects.toThrow(
      'Faltan variables de entorno requeridas: DATABASE_URL',
    );
    expect(runPgTool).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('conserva el dump local y falla si Storage rechaza la subida', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'denied' } });

    await expect(backupMain()).rejects.toThrow(
      'Error al subir backup a Supabase Storage (bk): denied',
    );
    expect(runPgTool).toHaveBeenCalledOnce();
    expect(fsMock.readFile).toHaveBeenCalledOnce();
  });
});

describe('db:restore orquestación', () => {
  const previousArgv = process.argv;
  const previousDatabaseUrl = process.env['DATABASE_URL'];
  const previousRestoreFile = process.env['DB_RESTORE_FILE'];

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ['node', 'db-restore.ts'];
    delete process.env['DB_RESTORE_FILE'];
    process.env['DATABASE_URL'] = RAW_URL;
    resolveDatabaseUrlForPgTools.mockResolvedValue(RESOLVED_URL);
    fsMock.access.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubExit();
  });

  afterEach(() => {
    process.argv = previousArgv;
    vi.mocked(console.log).mockRestore();
    vi.mocked(console.error).mockRestore();
    vi.mocked(process.exit).mockRestore();
    if (previousDatabaseUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousDatabaseUrl;
    }
    if (previousRestoreFile === undefined) {
      delete process.env['DB_RESTORE_FILE'];
    } else {
      process.env['DB_RESTORE_FILE'] = previousRestoreFile;
    }
  });

  it('restaura un .dump con pg_restore y la URL resuelta', async () => {
    process.argv = ['node', 'db-restore.ts', '--file', 'tmp/backup.dump'];

    await restoreMain();

    const filePath = path.resolve('tmp/backup.dump');
    expect(resolveDatabaseUrlForPgTools).toHaveBeenCalledWith(RAW_URL);
    expect(runPgTool).toHaveBeenCalledWith({
      tool: 'pg_restore',
      mountDir: path.dirname(filePath),
      env: { DATABASE_URL: RESOLVED_URL },
      args: ['--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', RESOLVED_URL, filePath],
    });
    const args = runPgTool.mock.calls[0]?.[0]?.args as string[];
    expect(args.join(' ')).not.toContain('db.abcdefgh.supabase.co');
  });

  it('restaura un .sql con psql y la URL resuelta', async () => {
    process.argv = ['node', 'db-restore.ts', '--file', 'tmp/backup.sql'];

    await restoreMain();

    const filePath = path.resolve('tmp/backup.sql');
    expect(runPgTool).toHaveBeenCalledWith({
      tool: 'psql',
      mountDir: path.dirname(filePath),
      env: { DATABASE_URL: RESOLVED_URL },
      args: ['--dbname', RESOLVED_URL, '--file', filePath, '--single-transaction', '--set', 'ON_ERROR_STOP=1'],
    });
  });

  it('aborta antes de tocar la base si el archivo no existe', async () => {
    process.argv = ['node', 'db-restore.ts', '--file', 'tmp/missing.dump'];
    fsMock.access.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(restoreMain()).rejects.toThrow('process.exit:1');
    expect(runPgTool).not.toHaveBeenCalled();
    expect(resolveDatabaseUrlForPgTools).not.toHaveBeenCalled();
  });

  it('aborta antes de tocar la base si la extensión no es soportada', async () => {
    process.argv = ['node', 'db-restore.ts', '--file', 'tmp/backup.zip'];

    await expect(restoreMain()).rejects.toThrow('process.exit:1');
    expect(fsMock.access).not.toHaveBeenCalled();
    expect(runPgTool).not.toHaveBeenCalled();
    expect(resolveDatabaseUrlForPgTools).not.toHaveBeenCalled();
  });
});
