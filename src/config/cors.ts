import type { CorsOptions } from 'cors';

/** Orígenes Vercel preview/production: https://<slug>.vercel.app */
const VERCEL_ORIGIN =
  /^https:\/\/[\w-]+(?:\.[\w-]+)*\.vercel\.app$/;

function parseExtraOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(
  origin: string,
  primaryOrigin: string,
  extraOrigins: readonly string[],
  allowVercelPreviews: boolean,
): boolean {
  if (origin === primaryOrigin) return true;
  if (extraOrigins.includes(origin)) return true;
  if (allowVercelPreviews && VERCEL_ORIGIN.test(origin)) return true;
  return false;
}

export function createCorsOptions(config: {
  primaryOrigin: string;
  extraOrigins: readonly string[];
  allowVercelPreviews: boolean;
}): CorsOptions {
  const { primaryOrigin, extraOrigins, allowVercelPreviews } = config;

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        isAllowedCorsOrigin(origin, primaryOrigin, extraOrigins, allowVercelPreviews)
      ) {
        callback(null, origin);
        return;
      }

      callback(null, false);
    },
  };
}
