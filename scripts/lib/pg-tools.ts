import { spawnSync } from 'child_process';
import { resolve4 } from 'node:dns/promises';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

export type PgToolName = 'pg_dump' | 'pg_restore' | 'psql';

const TOOL_ENV_KEYS: Record<PgToolName, string> = {
  pg_dump: 'PG_DUMP',
  pg_restore: 'PG_RESTORE',
  psql: 'PSQL',
};

const DEFAULT_DOCKER_IMAGE = 'postgres:17';

function executableName(tool: PgToolName): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveFromPgBin(tool: PgToolName): string | null {
  const pgBin = process.env['PG_BIN'];
  if (!pgBin) {
    return null;
  }

  const candidate = path.join(pgBin, executableName(tool));
  return fileExists(candidate) ? candidate : null;
}

function resolveFromPathLookup(tool: PgToolName): string | null {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [tool], { encoding: 'utf-8' });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  const candidate = result.stdout.trim().split(/\r?\n/)[0]?.trim();
  if (!candidate) {
    return null;
  }

  return fileExists(candidate) ? candidate : null;
}

function resolveFromWindowsInstallDirs(tool: PgToolName): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const roots = [
    path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'PostgreSQL'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'PostgreSQL'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }

    const versions = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    for (const version of versions) {
      const candidate = path.join(root, version, 'bin', executableName(tool));
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function resolvePgToolPath(tool: PgToolName): string | null {
  const envKey = TOOL_ENV_KEYS[tool];
  const envOverride = process.env[envKey];
  if (envOverride && fileExists(envOverride)) {
    return envOverride;
  }

  return (
    resolveFromPgBin(tool) ??
    resolveFromPathLookup(tool) ??
    resolveFromWindowsInstallDirs(tool)
  );
}

export function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['version'], { encoding: 'utf-8', stdio: 'ignore' });
  return result.status === 0;
}

function dockerFallbackEnabled(): boolean {
  const raw = process.env['DB_BACKUP_PG_DOCKER'];
  if (raw === '0' || raw === 'false') {
    return false;
  }
  return true;
}

function dockerImage(): string {
  return process.env['DB_BACKUP_PG_IMAGE'] ?? DEFAULT_DOCKER_IMAGE;
}

/** Docker Desktop en Windows suele no tener ruta IPv6; Supabase direct DB suele ser solo AAAA. */
export async function getHostIpFamily(host: string): Promise<'ipv4' | 'ipv6-only' | 'unknown'> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return 'unknown';
  }

  let hasIpv4 = false;
  let hasIpv6 = false;

  try {
    const v4 = await resolve4(host);
    hasIpv4 = v4.length > 0;
  } catch {
    hasIpv4 = false;
  }

  try {
    const { resolve6 } = await import('node:dns/promises');
    const v6 = await resolve6(host);
    hasIpv6 = v6.length > 0;
  } catch {
    hasIpv6 = false;
  }

  if (hasIpv4) {
    return 'ipv4';
  }
  if (hasIpv6) {
    return 'ipv6-only';
  }
  return 'unknown';
}

export async function preferIpv4DatabaseUrl(databaseUrl: string): Promise<string> {
  const match = databaseUrl.match(/^(postgres(?:ql)?:\/\/)([^@]*@)?([^:/]+)(.*)$/i);
  if (!match) {
    return databaseUrl;
  }

  const [, scheme, credentials = '', host, rest] = match;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return databaseUrl;
  }

  try {
    const addresses = await resolve4(host);
    const address = addresses[0];
    if (!address) {
      return databaseUrl;
    }
    return `${scheme}${credentials}${address}${rest}`;
  } catch {
    return databaseUrl;
  }
}

const SUPABASE_POOLER_REGIONS = [
  'eu-central-1',
  'sa-east-1',
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-south-1',
  'ca-central-1',
];

export function buildSupabaseSessionPoolerUrls(databaseUrl: string): string[] {
  const match = databaseUrl.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co(:\d+)?(\/[^?]*)?/i,
  );
  if (!match) {
    return [];
  }

  const [, , password, projectRef, port = ':5432', dbPath = '/postgres'] = match;
  const hosts: string[] = [];

  for (const region of SUPABASE_POOLER_REGIONS) {
    for (const awsPrefix of ['aws-1', 'aws-0']) {
      hosts.push(`${awsPrefix}-${region}.pooler.supabase.com`);
    }
  }
  hosts.push(`db.${projectRef}.supabase.co`);

  const ports = port === ':5432' ? [':5432', ':6543'] : [port];

  const urls: string[] = [];
  for (const poolHost of hosts) {
    for (const poolPort of ports) {
      urls.push(
        `postgresql://postgres.${projectRef}:${password}@${poolHost}${poolPort}${dbPath}`,
      );
    }
  }
  return urls;
}

/**
 * Candidatos del Session pooler (puerto 5432) cuando el host directo de Supabase
 * es solo IPv6. `null` significa usar `databaseUrl` tal cual.
 */
export function supabaseSessionPoolerCandidates(
  databaseUrl: string,
  ipFamily: 'ipv4' | 'ipv6-only' | 'unknown',
): string[] | null {
  const match = databaseUrl.match(/^(postgres(?:ql)?:\/\/)([^@]*@)?([^:/]+)(.*)$/i);
  if (!match) {
    return null;
  }

  const host = match[3] ?? '';
  if (!/^db\.[^.]+\.supabase\.co$/i.test(host) || ipFamily !== 'ipv6-only') {
    return null;
  }

  return buildSupabaseSessionPoolerUrls(databaseUrl).filter((url) =>
    url.includes('.pooler.supabase.com:5432/'),
  );
}

async function canConnectWithNodePg(databaseUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function firstReachableUrl(
  candidates: string[],
  canConnect: (url: string) => Promise<boolean>,
): Promise<string | null> {
  const batchSize = 8;
  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const winner = await new Promise<string | null>((resolve) => {
      let pending = batch.length;
      let settled = false;
      for (const url of batch) {
        void Promise.resolve()
          .then(() => canConnect(url))
          .then((ok) => {
            if (ok && !settled) {
              settled = true;
              resolve(url);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            pending -= 1;
            if (pending === 0 && !settled) {
              resolve(null);
            }
          });
      }
    });
    if (winner) {
      return winner;
    }
  }
  return null;
}

/** URL usable por `pg` en Node. En Supabase solo-IPv6 prueba el Session pooler. */
export async function resolveDatabaseUrlForNodePg(
  databaseUrl: string,
  canConnect: (url: string) => Promise<boolean> = canConnectWithNodePg,
): Promise<string> {
  const override = process.env['DB_BACKUP_DATABASE_URL']?.trim();
  if (override) {
    return override;
  }

  const match = databaseUrl.match(/^(postgres(?:ql)?:\/\/)([^@]*@)?([^:/]+)(.*)$/i);
  if (!match) {
    return databaseUrl;
  }

  const host = match[3] ?? '';
  const candidates = supabaseSessionPoolerCandidates(databaseUrl, await getHostIpFamily(host));
  if (!candidates || candidates.length === 0) {
    return databaseUrl;
  }

  const reachable = await firstReachableUrl(candidates, canConnect);
  if (!reachable) {
    throw new Error(
      'La base Supabase directa es solo IPv6 y no es alcanzable desde este entorno. ' +
        'Definí DB_BACKUP_DATABASE_URL con el connection string del Session pooler (Dashboard → Database → Connect).',
    );
  }

  console.log('Usando Supabase Session pooler (IPv4)');
  return reachable;
}

function canConnectWithPsql(databaseUrl: string): boolean {
  const psqlPath = resolvePgToolPath('psql');
  if (!psqlPath) {
    return false;
  }

  const result = spawnSync(psqlPath, ['--dbname', databaseUrl, '-c', 'SELECT 1'], {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 20000,
  });
  return result.status === 0;
}

/** Resuelve el host en Node (libpq en Windows a veces falla con hostnames Supabase). */
export async function resolveDatabaseUrlForPgTools(databaseUrl: string): Promise<string> {
  const override = process.env['DB_BACKUP_DATABASE_URL']?.trim();
  if (override) {
    return override;
  }

  const match = databaseUrl.match(/^(postgres(?:ql)?:\/\/)([^@]*@)?([^:/]+)(.*)$/i);
  if (!match) {
    return databaseUrl;
  }

  const [, scheme, credentials = '', host, rest] = match;
  const isSupabaseDirect = /^db\.[^.]+\.supabase\.co$/i.test(host);

  if (isSupabaseDirect && (await getHostIpFamily(host)) === 'ipv6-only') {
    const poolerCandidates = buildSupabaseSessionPoolerUrls(databaseUrl);
    for (const candidate of poolerCandidates) {
      if (canConnectWithPsql(candidate)) {
        console.log('Usando Supabase Session pooler (IPv4) para herramientas pg_*');
        return candidate;
      }
    }

    throw new Error(
      'La base Supabase directa es solo IPv6 y no es alcanzable desde este entorno. ' +
        'Definí DB_BACKUP_DATABASE_URL con el connection string del Session pooler (Dashboard → Database → Connect).',
    );
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    return databaseUrl;
  }

  try {
    const addresses = await resolve4(host);
    const address = addresses[0];
    if (address) {
      return `${scheme}${credentials}${address}${rest}`;
    }
  } catch {
    // IPv4 no disponible — probar IPv6
  }

  try {
    const { resolve6 } = await import('node:dns/promises');
    const addresses = await resolve6(host);
    const address = addresses[0];
    if (address) {
      return `${scheme}${credentials}[${address}]${rest}`;
    }
  } catch {
    // sin resolución
  }

  return databaseUrl;
}

function remapHostPathToDocker(arg: string, hostDir: string, dockerDir: string): string {
  if (arg.includes('://')) {
    return arg;
  }

  const resolvedHostDir = path.resolve(hostDir);
  const resolvedArg = path.resolve(arg);
  if (resolvedArg === resolvedHostDir || resolvedArg.startsWith(`${resolvedHostDir}${path.sep}`)) {
    const relative = path.relative(resolvedHostDir, resolvedArg);
    return path.posix.join(dockerDir, relative.split(path.sep).join('/'));
  }
  return arg;
}

function toDockerVolumePath(hostPath: string): string {
  if (process.platform !== 'win32') {
    return hostPath;
  }

  const resolved = path.resolve(hostPath);
  if (/^[A-Za-z]:/.test(resolved)) {
    const drive = resolved[0].toLowerCase();
    const rest = resolved.slice(2).replace(/\\/g, '/');
    return `/${drive}${rest}`;
  }

  return resolved.replace(/\\/g, '/');
}

function extractDatabaseHost(databaseUrl: string): string | null {
  const match = databaseUrl.match(/^(?:postgres(?:ql)?:\/\/)(?:[^@]*@)?([^:/]+)/i);
  return match?.[1] ?? null;
}

function buildIpv6OnlyMessage(tool: PgToolName): string {
  return [
    `${tool} no está instalado localmente y el host de DATABASE_URL solo tiene IPv6.`,
    'Docker en Windows no puede conectarse a ese endpoint.',
    '',
    'Soluciones:',
    '  1) Instalar cliente PostgreSQL (recomendado):',
    '     winget install PostgreSQL.PostgreSQL.17',
    '     Reiniciá la terminal y volvé a ejecutar el comando.',
    '  2) Usar el connection string del Session pooler (IPv4) de Supabase',
    '     (Dashboard → Database → Connect → Session pooler) en DATABASE_URL.',
    '  3) Definir PG_BIN si ya tenés pg_dump instalado en otra ruta.',
  ].join('\n');
}

function buildPgToolUnavailableMessage(tool: PgToolName): string {
  return [
    `${tool} no está disponible en PATH.`,
    'Opciones:',
    '  1) Instalar cliente PostgreSQL: winget install PostgreSQL.PostgreSQL.17',
    '  2) Definir PG_BIN (ej. C:\\Program Files\\PostgreSQL\\17\\bin)',
    `  3) Definir ${TOOL_ENV_KEYS[tool]} con la ruta completa al ejecutable`,
    '  4) Usar Docker solo si el host de DATABASE_URL tiene IPv4',
    '  5) Desactivar Docker: DB_BACKUP_PG_DOCKER=0',
  ].join('\n');
}

export interface RunPgToolOptions {
  tool: PgToolName;
  args: string[];
  env?: Record<string, string>;
  mountDir?: string;
}

export async function runPgTool(options: RunPgToolOptions): Promise<void> {
  const localPath = resolvePgToolPath(options.tool);

  if (localPath) {
    const result = spawnSync(localPath, options.args, {
      stdio: 'inherit',
      encoding: 'utf-8',
      env: { ...process.env, ...options.env },
    });

    if (result.error) {
      throw new Error(`${options.tool} falló: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`${options.tool} falló con código ${result.status ?? 'desconocido'}`);
    }
    return;
  }

  if (!dockerFallbackEnabled() || !isDockerAvailable()) {
    throw new Error(buildPgToolUnavailableMessage(options.tool));
  }

  const rawDatabaseUrl = options.env?.['DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (rawDatabaseUrl) {
    const host = extractDatabaseHost(rawDatabaseUrl);
    if (host && (await getHostIpFamily(host)) === 'ipv6-only') {
      throw new Error(buildIpv6OnlyMessage(options.tool));
    }
  }

  if (!options.mountDir) {
    throw new Error(
      `${buildPgToolUnavailableMessage(options.tool)}\n` +
        'El fallback Docker requiere mountDir para leer/escribir archivos de backup.',
    );
  }

  const mountHost = path.resolve(options.mountDir);
  const mountDocker = '/pgdata';
  const databaseUrl =
    rawDatabaseUrl !== undefined ? await preferIpv4DatabaseUrl(rawDatabaseUrl) : undefined;
  const dockerEnvArgs =
    databaseUrl !== undefined ? ['-e', `DATABASE_URL=${databaseUrl}`] : [];

  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    `${toDockerVolumePath(mountHost)}:${mountDocker}`,
    ...dockerEnvArgs,
    dockerImage(),
    options.tool,
    ...options.args.map((arg) => {
      if (arg === rawDatabaseUrl && databaseUrl !== undefined) {
        return databaseUrl;
      }
      return remapHostPathToDocker(arg, mountHost, mountDocker);
    }),
  ];

  console.log(`Usando Docker (${dockerImage()}) para ejecutar ${options.tool}`);
  const result = spawnSync('docker', dockerArgs, { stdio: 'inherit', encoding: 'utf-8' });

  if (result.error) {
    throw new Error(`Docker ${options.tool} falló: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Docker ${options.tool} falló con código ${result.status ?? 'desconocido'}`);
  }
}
