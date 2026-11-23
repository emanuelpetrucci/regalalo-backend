import path from 'path';

export const DEFAULT_BACKUP_DIR = '.bk';
export const BACKUP_BUCKET = 'bk';
export const SUPPORTED_RESTORE_EXTENSIONS = ['.dump', '.sql', '.backup'] as const;

export type SupportedRestoreExtension = (typeof SUPPORTED_RESTORE_EXTENSIONS)[number];

export function resolveBackupDir(): string {
  return process.env['DB_BACKUP_DIR'] ?? DEFAULT_BACKUP_DIR;
}

export function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function buildBackupFilename(timestamp: string): string {
  return `backup-${timestamp}.dump`;
}

export function buildRemoteBackupKey(filename: string): string {
  return `backups/${filename}`;
}

export function parseRestoreFileArg(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('--file=')) {
      const value = arg.slice('--file='.length).trim();
      if (value) {
        return value;
      }
    }
  }

  const idx = argv.indexOf('--file');
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }

  for (const arg of argv) {
    if (arg.startsWith('-')) {
      continue;
    }
    if (isSupportedRestoreExtension(getRestoreExtension(arg))) {
      return arg;
    }
  }

  return null;
}

export function resolveRestoreFile(argv: string[]): string | null {
  const fromEnv = process.env['DB_RESTORE_FILE']?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return parseRestoreFileArg(argv);
}

export const RESTORE_USAGE = [
  'Uso:',
  '  npm run db:restore:dev -- --file .bk/backup-YYYY-MM-DD.dump',
  '  npm run db:restore:dev -- .bk/backup-YYYY-MM-DD.dump',
  '  DB_RESTORE_FILE=.bk/backup.dump npm run db:restore:dev',
  '',
  'Nota: el separador "--" es obligatorio antes de --file o la ruta; sin él npm no reenvía argumentos al script.',
].join('\n');

export function getRestoreExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function isSupportedRestoreExtension(ext: string): ext is SupportedRestoreExtension {
  return (SUPPORTED_RESTORE_EXTENSIONS as readonly string[]).includes(ext);
}

export function requireEnv(keys: readonly string[]): Record<string, string> {
  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
      continue;
    }
    values[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
  }

  return values;
}
