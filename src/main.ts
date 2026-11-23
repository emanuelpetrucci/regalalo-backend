import { app } from './app';
import { env } from './config/env';
import { appLogger } from './config/loggers';
import { db } from './infrastructure/database/supabase/db';
import { PostgresItemRepository } from './infrastructure/database/supabase/item.repository';
import { createStorageAdapter } from './infrastructure/storage/create-storage-adapter';
import { ResendMailProvider } from './infrastructure/email/resend.provider';
import { DegradeInactiveItemsUseCase } from './application/use-cases/item/degrade-inactive-items.use-case';
import { startItemDegradationScheduler } from './infrastructure/scheduler/item-degradation.scheduler';
import { startStorageDeletionScheduler } from './infrastructure/scheduler/storage-deletion.scheduler';
import { PostgresDeliverySessionRepository } from './infrastructure/database/supabase/delivery-session.repository';
import { ExpireDeliverySessionsUseCase } from './application/use-cases/delivery/expire-delivery-sessions.use-case';
import { startDeliverySessionExpirationScheduler } from './infrastructure/scheduler/delivery-session-expiration.scheduler';
import { initAnalyticsPersistence } from './application/services/analytics-persistence';
import { PostgresAnalyticsEventRepository } from './infrastructure/database/supabase/analytics-event.repository';

initAnalyticsPersistence(new PostgresAnalyticsEventRepository(db));

app.listen(env.PORT, '0.0.0.0', () => {
  appLogger.info({ port: env.PORT }, 'Server started');

  const itemRepo = new PostgresItemRepository(db);
  const mailService = new ResendMailProvider();
  const degradeUseCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  startItemDegradationScheduler(degradeUseCase);

  const deliverySessionRepo = new PostgresDeliverySessionRepository(db);
  const expireSessionsUseCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
  startDeliverySessionExpirationScheduler(expireSessionsUseCase);

  const storageAdapter = createStorageAdapter(db);
  startStorageDeletionScheduler(storageAdapter);

}).on('error', (err: NodeJS.ErrnoException) => {
  appLogger.fatal(err, 'Server failed to start');
  process.exit(1);
});
