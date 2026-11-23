import './load-env';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requiredPort(): number {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  if (isNaN(port)) throw new Error(`Invalid PORT env var: must be a number`);
  return port;
}

function requiredSecret(name: string, minLength = 32): string {
  const value = required(name);
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long`);
  }
  return value;
}

function validatedJwtExpiresIn(): string {
  const value = process.env['JWT_EXPIRES_IN'] ?? '7d';
  if (!/^\d+[smhdwy]$/.test(value) && !/^\d+$/.test(value)) {
    throw new Error('JWT_EXPIRES_IN must be a number (seconds) or a duration string like "7d", "24h", "3600"');
  }
  return value;
}

const PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevel = (typeof PINO_LEVELS)[number];

function validatedLogLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL'] ?? 'info';
  const value = raw.toLowerCase();
  if (!(PINO_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`Invalid LOG_LEVEL "${raw}". Must be one of: ${PINO_LEVELS.join(', ')}`);
  }
  return value as LogLevel;
}

function optionalLogFile(): string | undefined {
  const value = process.env['LOG_FILE']?.trim();
  return value === '' ? undefined : value;
}

export type AnalyticsPersistence = 'postgres' | 'stdout';

function resolvedCronSecret(): string {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'test') {
    return process.env['CRON_SECRET'] ?? 'test-cron-secret-min-32-characters-long';
  }
  return requiredSecret('CRON_SECRET', 32);
}

function resolvedAnalyticsPersistence(): AnalyticsPersistence {
  const raw = process.env['ANALYTICS_PERSISTENCE']?.trim().toLowerCase();
  if (raw === 'postgres' || raw === 'stdout') return raw;
  if (raw !== undefined && raw !== '') {
    throw new Error(
      `Invalid ANALYTICS_PERSISTENCE "${process.env['ANALYTICS_PERSISTENCE']}". Must be postgres or stdout.`,
    );
  }
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production') return 'postgres';
  return 'stdout';
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return defaultValue;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new Error(`Invalid ${name} "${process.env[name]}". Must be true or false.`);
}

function parseExtraOrigins(): string[] {
  const raw = process.env['CORS_EXTRA_ORIGINS'];
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolvedAllowVercelPreviews(): boolean {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const defaultValue = nodeEnv !== 'production';
  return parseBooleanEnv('CORS_ALLOW_VERCEL_PREVIEWS', defaultValue);
}

function resolvedE2eEnabled(): boolean {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production') return false;
  return parseBooleanEnv('E2E_ENABLED', false);
}

function resolvedE2eSecret(e2eEnabled: boolean): string {
  if (!e2eEnabled) return '';
  const secret = process.env['E2E_SECRET'] ?? '';
  if (secret.length < 32) {
    throw new Error('E2E_SECRET must be at least 32 characters when E2E_ENABLED=true');
  }
  return secret;
}

const e2eEnabled = resolvedE2eEnabled();

export const env = {
  PORT: requiredPort(),
  NODE_ENV: (process.env['NODE_ENV'] ?? 'development') as 'development' | 'production' | 'test',
  E2E_ENABLED: e2eEnabled,
  E2E_SECRET: resolvedE2eSecret(e2eEnabled),
  E2E_DEFAULT_PASSWORD: process.env['E2E_DEFAULT_PASSWORD'] ?? 'Test1234!',
  DATABASE_URL: required('DATABASE_URL'),
  LOG_LEVEL: validatedLogLevel(),
  LOG_FILE: optionalLogFile(),
  ANALYTICS_PERSISTENCE: resolvedAnalyticsPersistence(),
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:4200',
  CORS_EXTRA_ORIGINS: parseExtraOrigins(),
  CORS_ALLOW_VERCEL_PREVIEWS: resolvedAllowVercelPreviews(),
  APP_PUBLIC_URL: required('APP_PUBLIC_URL'),
  JWT_SECRET: requiredSecret('JWT_SECRET', 32),
  JWT_EXPIRES_IN: validatedJwtExpiresIn(),
  RECAPTCHA_SECRET_KEY: required('RECAPTCHA_SECRET_KEY'),
  RESEND_API_KEY: required('RESEND_API_KEY'),
  RESEND_FROM: required('RESEND_FROM'),
  NOMINATIM_BASE_URL: process.env['NOMINATIM_BASE_URL'] ?? 'https://nominatim.openstreetmap.org',
  STORAGE_DRIVER: (process.env['STORAGE_DRIVER'] ?? 'supabase') as 'supabase' | 'local',
  LOCAL_STORAGE_DIR: process.env['LOCAL_STORAGE_DIR'] ?? '.storage',
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_STORAGE_BUCKET: required('SUPABASE_STORAGE_BUCKET'),
  CRON_SECRET: resolvedCronSecret(),
  ADMIN_JWT_SECRET: requiredSecret('ADMIN_JWT_SECRET', 64),
  ADMIN_EMAIL: required('ADMIN_EMAIL'),
  ADMIN_CORS_ORIGIN: process.env['ADMIN_CORS_ORIGIN'] ?? 'https://admin.regalalo.org',
} as const;
