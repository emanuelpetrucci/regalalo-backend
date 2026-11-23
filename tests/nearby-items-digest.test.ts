import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../src/app';
import { SendNearbyItemsDigestUseCase } from '../src/application/use-cases/jobs/send-nearby-items-digest.use-case';
import {
  IItemRepository,
  PendingDigestItem,
} from '../src/domain/repositories/item.repository';
import { IMailService } from '../src/domain/services/mail.service';
import { createJobsRouter } from '../src/interfaces/http/routes/jobs.routes';

const CRON_SECRET = 'test-cron-secret-min-32-characters-long';

const PENDING_ITEM: PendingDigestItem = {
  itemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  donorId: 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb',
  title: 'Bicicleta infantil',
  condition: 'good',
  firstImagePath: 'items/photo.jpg',
};

function buildMocks(pending: PendingDigestItem[] = [PENDING_ITEM]) {
  const itemRepo = {
    claimPendingDigestItems: vi.fn().mockResolvedValue(pending),
    findEligibleDigestUsersForItem: vi.fn().mockResolvedValue([
      {
        userId: '11111111-2222-4333-8444-555555555555',
        email: 'nearby@test.com',
        firstName: 'Ana',
        distanceKm: 3,
        preferredLanguage: 'es',
      },
    ]),
  } as unknown as IItemRepository;

  const mailService: IMailService = {
    send: vi.fn().mockResolvedValue(undefined),
  };

  return { itemRepo, mailService };
}

function createJobsTestApp(itemRepo: IItemRepository, mailService: IMailService) {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/jobs', createJobsRouter({ itemRepo, mailService }));
  return testApp;
}

describe('GET /api/jobs/nearby-items-digest', () => {
  it('10.1 — 401 sin header X-Cron-Secret', async () => {
    const res = await request(app).get('/api/jobs/nearby-items-digest');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('10.1 — 401 con secreto incorrecto', async () => {
    const res = await request(app)
      .get('/api/jobs/nearby-items-digest')
      .set('X-Cron-Secret', 'wrong-secret-value-that-is-long-enough');
    expect(res.status).toBe(401);
  });

  it('10.1 — 200 con X-Cron-Secret válido y Cache-Control: no-store', async () => {
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM]);
    const testApp = createJobsTestApp(itemRepo, mailService);

    const res = await request(testApp)
      .get('/api/jobs/nearby-items-digest')
      .set('X-Cron-Secret', CRON_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      processedItems: 1,
      recipientsNotified: 1,
      emailsSent: 1,
      emailsFailed: 0,
    });
    expect(res.body.executionMs).toEqual(expect.any(Number));
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mailService.send).toHaveBeenCalledOnce();
  });
});

describe('POST /api/jobs/nearby-items-digest', () => {
  it('10.1 — 401 sin header X-Cron-Secret', async () => {
    const res = await request(app).post('/api/jobs/nearby-items-digest');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('10.1 — 401 con secreto incorrecto', async () => {
    const res = await request(app)
      .post('/api/jobs/nearby-items-digest')
      .set('X-Cron-Secret', 'wrong-secret-value-that-is-long-enough');
    expect(res.status).toBe(401);
  });

  it('10.1 — 200 con X-Cron-Secret válido', async () => {
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM]);
    const testApp = createJobsTestApp(itemRepo, mailService);

    const res = await request(testApp)
      .post('/api/jobs/nearby-items-digest')
      .set('X-Cron-Secret', CRON_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      processedItems: 1,
      recipientsNotified: 1,
      emailsSent: 1,
      emailsFailed: 0,
    });
    expect(res.body.executionMs).toEqual(expect.any(Number));
    expect(mailService.send).toHaveBeenCalledOnce();
  });
});

describe('SendNearbyItemsDigestUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('10.1 — 200 vacío sin objetos pendientes', async () => {
    const { itemRepo, mailService } = buildMocks([]);
    const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
    const result = await useCase.execute();

    expect(result).toEqual({
      processedItems: 0,
      recipientsNotified: 0,
      emailsSent: 0,
      emailsFailed: 0,
    });
    expect(mailService.send).not.toHaveBeenCalled();
    expect(itemRepo.claimPendingDigestItems).toHaveBeenCalledOnce();
  });

  it('10.1 — reclama items antes de enviar y envía TPL-010', async () => {
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM]);
    const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
    const result = await useCase.execute();

    const claimOrder = vi.mocked(itemRepo.claimPendingDigestItems).mock.invocationCallOrder[0]!;
    const sendOrder = vi.mocked(mailService.send).mock.invocationCallOrder[0]!;
    expect(claimOrder).toBeLessThan(sendOrder);
    expect(result.processedItems).toBe(1);
    expect(result.recipientsNotified).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(0);
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'nearby@test.com',
        templateId: 'TPL-010',
        language: 'es',
        variables: expect.objectContaining({
          firstName: 'Ana',
          itemCount: 1,
        }),
      }),
    );
  });

  it('10.1 — agrupa dos objetos en un solo email por usuario', async () => {
    const item2: PendingDigestItem = {
      ...PENDING_ITEM,
      itemId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      title: 'Mesa de luz',
    };
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM, item2]);
    const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledOnce();
    const payload = vi.mocked(mailService.send).mock.calls[0]![0];
    expect(payload.variables.itemCount).toBe(2);
    const items = JSON.parse(String(payload.variables.itemsJson)) as { title: string }[];
    expect(items.map(i => i.title).sort()).toEqual(['Bicicleta infantil', 'Mesa de luz']);
  });

  it('10.1 — continúa si un email falla', async () => {
    const item2: PendingDigestItem = {
      ...PENDING_ITEM,
      itemId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    };
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM, item2]);
    vi.mocked(itemRepo.findEligibleDigestUsersForItem)
      .mockResolvedValueOnce([
        {
          userId: '11111111-2222-4333-8444-555555555555',
          email: 'fail@test.com',
          firstName: 'Ana',
          distanceKm: 1,
          preferredLanguage: 'es',
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: '22222222-3333-4444-8555-666666666666',
          email: 'ok@test.com',
          firstName: 'Luis',
          distanceKm: 2,
          preferredLanguage: 'ca',
        },
      ]);
    vi.mocked(mailService.send)
      .mockRejectedValueOnce(new Error('Resend error'))
      .mockResolvedValueOnce(undefined);

    const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
    const result = await useCase.execute();

    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
    expect(result.recipientsNotified).toBe(2);
    expect(mailService.send).toHaveBeenCalledTimes(2);
  });

  it('10.1 — objetos sin destinatarios: items ya reclamados y cero emails', async () => {
    const { itemRepo, mailService } = buildMocks([PENDING_ITEM]);
    vi.mocked(itemRepo.findEligibleDigestUsersForItem).mockResolvedValue([]);
    const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
    const result = await useCase.execute();

    expect(result).toEqual({
      processedItems: 1,
      recipientsNotified: 0,
      emailsSent: 0,
      emailsFailed: 0,
    });
    expect(itemRepo.claimPendingDigestItems).toHaveBeenCalledOnce();
    expect(mailService.send).not.toHaveBeenCalled();
  });
});
