import { ExpireDeliverySessionsUseCase } from '../../application/use-cases/delivery/expire-delivery-sessions.use-case';
import { logger } from '../logging/logger';
const INTERVAL_MS = 60 * 60 * 1000;

export function startDeliverySessionExpirationScheduler(useCase: ExpireDeliverySessionsUseCase): void {
  const run = async (): Promise<void> => {
    try {
      await useCase.execute();
    } catch (err) {
      logger.error({ err }, 'Delivery session expiration scheduler failed');
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
