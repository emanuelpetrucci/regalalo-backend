import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresAdminSystemHealthRepository } from '../src/infrastructure/database/supabase/admin-system-health.repository';

function createMockPool() {
  return {
    query: vi.fn(),
  } as unknown as Pool;
}

const mockCanSelect = (canSelect: boolean) => ({
  rows: [{ exists: true, canSelect }],
  rowCount: 1,
} as never);

describe('PostgresAdminSystemHealthRepository', () => {
  let pool: Pool;
  let repository: PostgresAdminSystemHealthRepository;

  beforeEach(() => {
    pool = createMockPool();
    repository = new PostgresAdminSystemHealthRepository(pool);
    vi.clearAllMocks();
  });

  it('retorna [] cuando no puede leer cron.job', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(mockCanSelect(false));

    const result = await repository.getCronJobsLastRun();

    expect(result).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('to_regclass($1) IS NOT NULL');
    expect(params).toEqual(['cron.job']);
  });

  it('retorna jobs con historial usando LEFT JOIN cuando job_run_details es accesible', async () => {
    const firstRun = new Date('2026-06-18T10:00:00.000Z');
    const secondRun = new Date('2026-06-18T09:00:00.000Z');

    vi.mocked(pool.query)
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job_run_details
      .mockResolvedValueOnce({
        rows: [
          {
            jobName: 'expire-delivery-sessions',
            lastRunAt: firstRun,
            lastStatus: 'succeeded',
            returnMessage: null,
          },
          {
            jobName: 'purge-item-images',
            lastRunAt: secondRun,
            lastStatus: 'queued',
            returnMessage: 'running',
          },
        ],
        rowCount: 2,
      } as never);

    const result = await repository.getCronJobsLastRun();

    expect(pool.query).toHaveBeenCalledTimes(3);
    const [cronSql] = vi.mocked(pool.query).mock.calls[2] as [string];
    expect(cronSql).toContain('FROM cron.job j');
    expect(cronSql).toContain('LEFT JOIN cron.job_run_details d');
    expect(cronSql).toContain('j.jobname');

    expect(result).toEqual([
      {
        jobName: 'expire-delivery-sessions',
        lastRunAt: firstRun.toISOString(),
        lastStatus: 'succeeded',
        returnMessage: null,
      },
      {
        jobName: 'purge-item-images',
        lastRunAt: secondRun.toISOString(),
        lastStatus: null,
        returnMessage: 'running',
      },
    ]);
  });

  it('retorna jobs sin historial cuando job_run_details no es accesible', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job
      .mockResolvedValueOnce(mockCanSelect(false))  // cron.job_run_details
      .mockResolvedValueOnce({
        rows: [
          {
            jobName: 'degrade-inactive-items',
            lastRunAt: null,
            lastStatus: null,
            returnMessage: null,
          },
        ],
        rowCount: 1,
      } as never);

    const result = await repository.getCronJobsLastRun();

    expect(pool.query).toHaveBeenCalledTimes(3);
    const [cronSql] = vi.mocked(pool.query).mock.calls[2] as [string];
    expect(cronSql).toContain('FROM cron.job');
    expect(cronSql).not.toContain('LEFT JOIN');

    expect(result).toEqual([
      {
        jobName: 'degrade-inactive-items',
        lastRunAt: null,
        lastStatus: null,
        returnMessage: null,
      },
    ]);
  });

  it('retorna [] cuando la query de cron falla por columna indefinida (42703)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job_run_details
      .mockRejectedValueOnce({ code: '42703' } as never);

    const result = await repository.getCronJobsLastRun();

    expect(result).toEqual([]);
  });

  it('propaga errores de cron que no son 42703', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job
      .mockResolvedValueOnce(mockCanSelect(true))   // cron.job_run_details
      .mockRejectedValueOnce(new Error('connection lost') as never);

    await expect(repository.getCronJobsLastRun()).rejects.toThrow('connection lost');
  });
});
