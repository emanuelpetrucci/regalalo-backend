import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExpireDeliverySessionsUseCase } from '../src/application/use-cases/delivery/expire-delivery-sessions.use-case';
import { IDeliverySessionRepository, ExpiredSessionForEmail } from '../src/domain/repositories/delivery-session.repository';
import { IMailService } from '../src/domain/services/mail.service';

const { mockEmitEvent } = vi.hoisted(() => ({
  mockEmitEvent: vi.fn(),
}));

vi.mock('../src/application/services/analytics.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/application/services/analytics.service')>();
  return {
    ...actual,
    emitEvent: mockEmitEvent,
    safeEmitEvent: (
      event: string,
      userId: string,
      properties: Record<string, unknown>,
      sessionId?: string,
    ) => {
      if (!event || !userId) return;
      try {
        if (sessionId !== undefined) {
          mockEmitEvent(event, userId, properties, sessionId);
        } else {
          mockEmitEvent(event, userId, properties);
        }
      } catch {
        // analytics failure must not affect business flow
      }
    },
  };
});

import { emitEvent } from '../src/application/services/analytics.service';

const DONOR_UUID = '550e8400-e29b-41d4-a716-446655440000';

const EXPIRED_SESSION: ExpiredSessionForEmail = {
  sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  donorId: DONOR_UUID,
  createdAt: new Date('2026-05-12T10:00:00.000Z'),
  donorEmail: 'donor@test.com',
  donorFirstName: 'María',
  itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  itemTitle: 'Mesa de madera',
  category: 'furniture',
};

function buildMocks(sessions: ExpiredSessionForEmail[] = [EXPIRED_SESSION]) {
  const deliverySessionRepo = {
    findExpiredSessions: vi.fn().mockResolvedValue(sessions),
  } as unknown as IDeliverySessionRepository;

  const mailService: IMailService = {
    send: vi.fn().mockResolvedValue(undefined),
  };

  return { deliverySessionRepo, mailService };
}

describe('ExpireDeliverySessionsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('20.1 — envía TPL-004 al donante para sesión recién expirada', async () => {
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledOnce();
    expect(mailService.send).toHaveBeenCalledWith({
      to: 'donor@test.com',
      templateId: 'TPL-004',
      variables: {
        recipientEmail: 'donor@test.com',
        firstName: 'María',
        itemTitle: 'Mesa de madera',
        itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      },
    });

    expect(emitEvent).toHaveBeenCalledWith(
      'session.expired',
      DONOR_UUID,
      expect.objectContaining({
        sessionId: EXPIRED_SESSION.sessionId,
        itemId: EXPIRED_SESSION.itemId,
        category: 'furniture',
        durationMs: expect.any(Number),
      }),
      EXPIRED_SESSION.sessionId,
    );
    expect(emitEvent).toHaveBeenCalledTimes(1);

    const expiredProps = vi.mocked(emitEvent).mock.calls[0]![2] as Record<string, unknown>;
    expect(expiredProps).not.toHaveProperty('email');
    expect(expiredProps).not.toHaveProperty('weightRange');
  });

  it('20.2 — no envía emails si no hay sesiones expiradas', async () => {
    const { deliverySessionRepo, mailService } = buildMocks([]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('20.3 — envía un email por cada sesión expirada', async () => {
    const session2: ExpiredSessionForEmail = {
      sessionId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      donorId: '660e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date('2026-05-12T11:00:00.000Z'),
      donorEmail: 'donor2@test.com',
      donorFirstName: 'Pedro',
      itemId: 'cccccccc-dddd-eeee-ffff-000000000000',
      itemTitle: 'Bicicleta',
      category: 'sports',
    };
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION, session2]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenCalledWith(
      'session.expired',
      EXPIRED_SESSION.donorId,
      expect.objectContaining({
        sessionId: EXPIRED_SESSION.sessionId,
        itemId: EXPIRED_SESSION.itemId,
        category: 'furniture',
        durationMs: expect.any(Number),
      }),
      EXPIRED_SESSION.sessionId,
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'session.expired',
      session2.donorId,
      expect.objectContaining({
        sessionId: session2.sessionId,
        itemId: session2.itemId,
        category: 'sports',
        durationMs: expect.any(Number),
      }),
      session2.sessionId,
    );
  });

  it('CASO-11 — expiración automática no modifica reputación ni emite eventos de reputación', async () => {
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(deliverySessionRepo.findExpiredSessions).toHaveBeenCalledOnce();

    const migrationSql = readFileSync(
      join(
        __dirname,
        '../src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql',
      ),
      'utf8',
    );
    expect(migrationSql).not.toContain('reputation_events');
    expect(migrationSql).not.toContain('reputation_score');
    expect(migrationSql).not.toContain('consecutive_no_shows');
  });

  it('20.4 — si un email falla, continúa con el siguiente y no lanza excepción', async () => {
    const session2: ExpiredSessionForEmail = {
      sessionId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      donorId: '660e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date('2026-05-12T11:00:00.000Z'),
      donorEmail: 'donor2@test.com',
      donorFirstName: 'Pedro',
      itemId: 'cccccccc-dddd-eeee-ffff-000000000000',
      itemTitle: 'Bicicleta',
      category: 'sports',
    };
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION, session2]);
    vi.mocked(mailService.send).mockRejectedValueOnce(new Error('Resend error'));

    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await expect(useCase.execute()).resolves.not.toThrow();
    expect(mailService.send).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });
});
