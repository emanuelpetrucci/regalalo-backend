import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

const { mockInfo, mockSchedulePersistence } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockSchedulePersistence: vi.fn(),
}));

vi.mock('../src/config/loggers', () => ({
  analyticsLogger: { info: mockInfo },
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../src/application/services/analytics-persistence', () => ({
  scheduleAnalyticsPersistence: mockSchedulePersistence,
}));

import { emitEvent, safeEmitEvent, buildLimitReachedProperties, computeTimeToSelectMs, computeDaysActiveBeforeDegradation, REQUEST_LIMIT_WINDOW_MS } from '../src/application/services/analytics.service';

describe('analytics.service — emitEvent', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const expectedHash = createHash('sha256').update(uuid).digest('hex');

  beforeEach(() => {
    mockInfo.mockClear();
    mockSchedulePersistence.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('llama analyticsLogger.info una vez con payload canónico', () => {
    emitEvent('user.login', uuid, { source: 'web' });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const payload = mockInfo.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload).toMatchObject({
      event: 'user.login',
      userId: expectedHash,
      sessionId: null,
      properties: { source: 'web' },
    });
    expect(payload['timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockSchedulePersistence).toHaveBeenCalledTimes(1);
    expect(mockSchedulePersistence).toHaveBeenCalledWith(payload);
  });

  it('hashea userId con SHA-256 (64 hex chars) y no expone UUID crudo', () => {
    emitEvent('user.register', uuid, {});

    const payload = mockInfo.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload['userId']).toBe(expectedHash);
    expect(payload['userId']).toMatch(/^[a-f0-9]{64}$/);
    expect(payload['userId']).not.toBe(uuid);
  });

  it('incluye sessionId cuando se proporciona', () => {
    const sessionId = 'sess-abc-123';
    emitEvent('user.login', uuid, {}, sessionId);

    const payload = mockInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['sessionId']).toBe(sessionId);
  });

  it('usa sessionId null cuando se omite', () => {
    emitEvent('user.login', uuid, {});

    const payload = mockInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['sessionId']).toBeNull();
  });
});

describe('analytics.service — helpers DLT-004', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockInfo.mockClear();
    mockSchedulePersistence.mockClear();
  });

  it('REQUEST_LIMIT_WINDOW_MS alinea ventana de 720 h', () => {
    expect(REQUEST_LIMIT_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('buildLimitReachedProperties devuelve ISO 8601 con ventana de 720 h', () => {
    const ref = new Date('2026-05-25T12:00:00.000Z');
    const props = buildLimitReachedProperties(ref);

    expect(props.windowEnd).toBe('2026-05-25T12:00:00.000Z');
    expect(props.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(props.windowEnd).getTime() - new Date(props.windowStart).getTime()).toBe(
      REQUEST_LIMIT_WINDOW_MS,
    );
  });

  it('computeTimeToSelectMs retorna delta no negativo', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const refMs = new Date('2026-05-10T00:00:00.000Z').getTime();
    expect(computeTimeToSelectMs(createdAt, refMs)).toBe(9 * 24 * 60 * 60 * 1000);
  });

  it('computeTimeToSelectMs retorna 0 para fecha inválida', () => {
    expect(computeTimeToSelectMs('invalid-date')).toBe(0);
  });

  it('computeDaysActiveBeforeDegradation retorna días enteros', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const refMs = new Date('2026-05-11T00:00:00.000Z').getTime();
    expect(computeDaysActiveBeforeDegradation(createdAt, refMs)).toBe(10);
  });

  it('safeEmitEvent no propaga errores del logger', () => {
    mockInfo.mockImplementationOnce(() => {
      throw new Error('logger down');
    });
    expect(() => safeEmitEvent('item.requested', uuid, { itemId: 'x', category: 'furniture' })).not.toThrow();
  });

  it('safeEmitEvent no emite si userId está vacío', () => {
    safeEmitEvent('item.requested', '', { itemId: 'x' });
    expect(mockInfo).not.toHaveBeenCalled();
  });
});

describe('config/loggers', () => {
  it('appLogger y analyticsLogger tienen service correcto en bindings', async () => {
    vi.resetModules();
    vi.doUnmock('../src/config/loggers');

    const { appLogger, analyticsLogger } = await import('../src/config/loggers');

    expect(appLogger.bindings()).toMatchObject({ service: 'app' });
    expect(analyticsLogger.bindings()).toMatchObject({ service: 'analytics' });
  });
});
