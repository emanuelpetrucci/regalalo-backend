import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DegradeInactiveItemsUseCase } from '../src/application/use-cases/item/degrade-inactive-items.use-case';
import { IItemRepository, NewlyDegradedItem } from '../src/domain/repositories/item.repository';
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

const DONOR_ID = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb';

const DEGRADED_ITEM: NewlyDegradedItem = {
  itemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  itemTitle: 'Silla de oficina',
  donorId: DONOR_ID,
  category: 'furniture',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  donorEmail: 'donor@test.com',
  donorFirstName: 'María',
};

function buildMocks(items: NewlyDegradedItem[] = [DEGRADED_ITEM]) {
  const itemRepo = {
    findNewlyDegradedItems: vi.fn().mockResolvedValue(items),
  } as unknown as IItemRepository;

  const mailService: IMailService = {
    send: vi.fn().mockResolvedValue(undefined),
  };

  return { itemRepo, mailService };
}

describe('DegradeInactiveItemsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('D.1 — envía email para item recién degradado', async () => {
    const { itemRepo, mailService } = buildMocks([DEGRADED_ITEM]);
    const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledOnce();
    expect(mailService.send).toHaveBeenCalledWith({
      to: 'donor@test.com',
      templateId: 'TPL-007',
      variables: {
        recipientEmail: 'donor@test.com',
        firstName: 'María',
        itemTitle: 'Silla de oficina',
        itemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(emitEvent).toHaveBeenCalledWith(
      'item.degraded',
      DONOR_ID,
      expect.objectContaining({
        itemId: DEGRADED_ITEM.itemId,
        category: 'furniture',
        daysActiveBeforeDegradation: expect.any(Number),
      }),
    );
    const degradeProps = vi.mocked(emitEvent).mock.calls[0]![2] as {
      daysActiveBeforeDegradation: number;
    };
    expect(degradeProps.daysActiveBeforeDegradation).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(degradeProps.daysActiveBeforeDegradation)).toBe(true);
  });

  it('D.2 — no envía emails si no hay items degradados', async () => {
    const { itemRepo, mailService } = buildMocks([]);
    const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
    await useCase.execute();

    expect(mailService.send).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('D.3 — continúa con el siguiente item si un email falla', async () => {
    const item2: NewlyDegradedItem = {
      itemId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      itemTitle: 'Mesa auxiliar',
      donorId: 'eeeeeeee-ffff-4aaa-8bbb-cccccccccccc',
      category: 'kitchen',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      donorEmail: 'donor2@test.com',
      donorFirstName: 'Pedro',
    };
    const { itemRepo, mailService } = buildMocks([DEGRADED_ITEM, item2]);
    vi.mocked(mailService.send).mockRejectedValueOnce(new Error('Resend error'));

    const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
    await expect(useCase.execute()).resolves.not.toThrow();
    expect(mailService.send).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });
});
