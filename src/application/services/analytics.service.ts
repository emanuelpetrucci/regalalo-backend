import { createHash } from 'crypto';
import { analyticsLogger } from '../../config/loggers';
import {
  type AnalyticsEventPayload,
  scheduleAnalyticsPersistence,
} from './analytics-persistence';

/** Ventana deslizante de límite de solicitudes — alineada a SQL `INTERVAL '720 hours'`. */
export const REQUEST_LIMIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

function buildAnalyticsPayload(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
  sessionId?: string,
): AnalyticsEventPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    userId: hashUserId(userId),
    sessionId: sessionId ?? null,
    properties,
  };
}

/**
 * Emite un evento de analítica (fire-and-forget, post-commit en use cases).
 *
 * Reglas para consumidores (7.4+):
 * - Invocar solo después de commit de transacción BD.
 * - Preferir `safeEmitEvent` en use cases para garantizar no-bloqueo.
 * - No incluir PII en `properties` (email, coords, contact_channel, UUID crudo).
 */
export function emitEvent(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
  sessionId?: string,
): void {
  const payload = buildAnalyticsPayload(event, userId, properties, sessionId);
  analyticsLogger.info(payload);
  scheduleAnalyticsPersistence(payload);
}

/**
 * Wrapper fire-and-forget: captura errores del logger sin afectar el flujo de negocio.
 * Use cases deben invocar este helper en lugar de `emitEvent` directamente.
 */
export function safeEmitEvent(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
  sessionId?: string,
): void {
  if (!event || !userId) return;
  try {
    emitEvent(event, userId, properties, sessionId);
  } catch {
    // Fallo de analítica no revierte operación de negocio
  }
}

/** Propiedades AE-031 — ventana ISO 8601 de 720 h. */
export function buildLimitReachedProperties(referenceDate = new Date()): {
  windowStart: string;
  windowEnd: string;
} {
  return {
    windowStart: new Date(referenceDate.getTime() - REQUEST_LIMIT_WINDOW_MS).toISOString(),
    windowEnd: referenceDate.toISOString(),
  };
}

/** Milisegundos desde publicación hasta selección — AE-012. Retorna 0 si fecha inválida. */
export function computeTimeToSelectMs(createdAt: Date | string, referenceMs = Date.now()): number {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  const delta = referenceMs - createdMs;
  return Number.isFinite(delta) && delta >= 0 ? delta : 0;
}

/** Días enteros activos antes de degradación — AE-013. Retorna 0 si fecha inválida. */
export function computeDaysActiveBeforeDegradation(
  createdAt: Date | string,
  referenceMs = Date.now(),
): number {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  const delta = referenceMs - createdMs;
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return Math.floor(delta / MS_PER_DAY);
}
