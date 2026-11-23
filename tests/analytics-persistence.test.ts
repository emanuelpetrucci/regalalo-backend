import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('analytics-persistence', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    const { setAnalyticsEventRepositoryForTests } = await import(
      '../src/application/services/analytics-persistence'
    );
    setAnalyticsEventRepositoryForTests(undefined);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('scheduleAnalyticsPersistence no inserta cuando ANALYTICS_PERSISTENCE=stdout', async () => {
    vi.stubEnv('ANALYTICS_PERSISTENCE', 'stdout');
    vi.stubEnv('NODE_ENV', 'test');

    const mockInsert = vi.fn();
    const { setAnalyticsEventRepositoryForTests, scheduleAnalyticsPersistence } = await import(
      '../src/application/services/analytics-persistence'
    );
    setAnalyticsEventRepositoryForTests({ insert: mockInsert });

    scheduleAnalyticsPersistence({
      event: 'user.login',
      timestamp: '2026-05-26T10:00:00.000Z',
      userId: 'a'.repeat(64),
      sessionId: null,
      properties: {},
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('scheduleAnalyticsPersistence inserta en postgres de forma asíncrona', async () => {
    vi.stubEnv('ANALYTICS_PERSISTENCE', 'postgres');
    vi.stubEnv('NODE_ENV', 'development');

    const mockInsert = vi.fn().mockResolvedValue(undefined);
    const {
      setAnalyticsEventRepositoryForTests,
      scheduleAnalyticsPersistence,
      payloadToRecord,
    } = await import('../src/application/services/analytics-persistence');
    setAnalyticsEventRepositoryForTests({ insert: mockInsert });

    const payload = {
      event: 'item.published',
      timestamp: '2026-05-26T10:00:00.000Z',
      userId: 'b'.repeat(64),
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      properties: { category: 'furniture' },
    };

    scheduleAnalyticsPersistence(payload);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(payloadToRecord(payload));
  });

  it('fallo de insert no propaga error al caller', async () => {
    vi.stubEnv('ANALYTICS_PERSISTENCE', 'postgres');

    const mockInsert = vi.fn().mockRejectedValue(new Error('db down'));
    const { setAnalyticsEventRepositoryForTests, scheduleAnalyticsPersistence } = await import(
      '../src/application/services/analytics-persistence'
    );
    setAnalyticsEventRepositoryForTests({ insert: mockInsert });

    expect(() =>
      scheduleAnalyticsPersistence({
        event: 'user.login',
        timestamp: '2026-05-26T10:00:00.000Z',
        userId: 'c'.repeat(64),
        sessionId: null,
        properties: {},
      }),
    ).not.toThrow();

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockInsert).toHaveBeenCalled();
  });

  it('toSessionIdForPersistence acepta solo UUID v4', async () => {
    const { toSessionIdForPersistence } = await import(
      '../src/application/services/analytics-persistence'
    );

    expect(toSessionIdForPersistence(null)).toBeNull();
    expect(toSessionIdForPersistence('sess-abc')).toBeNull();
    expect(toSessionIdForPersistence('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(toSessionIdForPersistence('6ba7b810-9dad-11d1-80b4-00c04fd42991')).toBeNull();
  });

  it('payloadToRecord devuelve null si timestamp es inválido', async () => {
    const { payloadToRecord } = await import('../src/application/services/analytics-persistence');

    expect(
      payloadToRecord({
        event: 'user.login',
        timestamp: 'not-a-date',
        userId: 'd'.repeat(64),
        sessionId: null,
        properties: {},
      }),
    ).toBeNull();
  });
});
