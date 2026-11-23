import { env } from '../../config/env';
import { appLogger } from '../../config/loggers';
import type {
  AnalyticsEventRecord,
  IAnalyticsEventRepository,
} from '../../domain/repositories/analytics-event.repository';

export type AnalyticsEventPayload = {
  event: string;
  timestamp: string;
  userId: string;
  sessionId: string | null;
  properties: Record<string, unknown>;
};

/** Alineado a `interfaces/validators/uuid-param.validator.ts` (SEC-007). */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let repository: IAnalyticsEventRepository | undefined;
let testRepositoryOverride: IAnalyticsEventRepository | undefined;

/** Composition root (`main.ts`): inyectar implementación Postgres. */
export function initAnalyticsPersistence(repo: IAnalyticsEventRepository): void {
  repository = repo;
}

/** Solo tests: inyectar mock. */
export function setAnalyticsEventRepositoryForTests(
  repo: IAnalyticsEventRepository | undefined,
): void {
  testRepositoryOverride = repo;
}

function getRepository(): IAnalyticsEventRepository {
  if (testRepositoryOverride) return testRepositoryOverride;
  if (!repository) {
    throw new Error(
      'Analytics persistence not initialized. Call initAnalyticsPersistence() at startup.',
    );
  }
  return repository;
}

export function toSessionIdForPersistence(sessionId: string | null): string | null {
  if (!sessionId) return null;
  return UUID_V4_REGEX.test(sessionId) ? sessionId : null;
}

export function payloadToRecord(payload: AnalyticsEventPayload): AnalyticsEventRecord | null {
  const occurredAt = new Date(payload.timestamp);
  if (!Number.isFinite(occurredAt.getTime())) return null;

  return {
    event: payload.event,
    occurredAt,
    userIdHash: payload.userId,
    sessionId: toSessionIdForPersistence(payload.sessionId),
    properties: payload.properties,
  };
}

export function scheduleAnalyticsPersistence(payload: AnalyticsEventPayload): void {
  if (env.ANALYTICS_PERSISTENCE !== 'postgres') return;

  setImmediate(() => {
    void persistAnalyticsEvent(payload).catch((err: unknown) => {
      appLogger.warn(
        { err, event: payload.event },
        'Analytics event persistence failed',
      );
    });
  });
}

async function persistAnalyticsEvent(payload: AnalyticsEventPayload): Promise<void> {
  const record = payloadToRecord(payload);
  if (!record) {
    appLogger.warn(
      { event: payload.event, timestamp: payload.timestamp },
      'Skipping analytics persistence: invalid payload',
    );
    return;
  }
  await getRepository().insert(record);
}
