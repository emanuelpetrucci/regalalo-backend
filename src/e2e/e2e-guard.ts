import { env } from '../config/env';

/** E2E routes are never mounted in production or when E2E_ENABLED is false. */
export function isE2eApiAvailable(): boolean {
  return env.E2E_ENABLED && env.NODE_ENV !== 'production';
}
