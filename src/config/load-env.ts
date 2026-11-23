import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

export type AppEnv = 'local' | 'dev' | 'prod' | 'e2e';

const VALID_APP_ENV = new Set<AppEnv>(['local', 'dev', 'prod', 'e2e']);

function resolveAppEnv(): AppEnv {
  const raw = process.env['APP_ENV'] ?? 'local';
  if (!VALID_APP_ENV.has(raw as AppEnv)) {
    throw new Error(`Invalid APP_ENV="${raw}". Use: local | dev | prod | e2e`);
  }
  return raw as AppEnv;
}

/** Carga `.env.local`, `.env.dev`, `.env.prod` o `.env.e2e` según `APP_ENV` (por defecto `local`). */
export function loadEnv(): AppEnv {
  const appEnv = resolveAppEnv();
  const root = process.cwd();
  const primary = path.join(root, `.env.${appEnv}`);

  if (fs.existsSync(primary)) {
    config({ path: primary });
    return appEnv;
  }

  // En Render las variables vienen del panel; no hay .env.prod en el artefacto de deploy.
  if (process.env['RENDER'] === 'true') {
    return appEnv;
  }

  const legacy = path.join(root, '.env');
  if (appEnv === 'local' && fs.existsSync(legacy)) {
    config({ path: legacy });
    return appEnv;
  }

  throw new Error(`Missing env file: ${primary} (APP_ENV=${appEnv})`);
}

loadEnv();
