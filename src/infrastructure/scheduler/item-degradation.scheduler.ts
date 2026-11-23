import { DegradeInactiveItemsUseCase } from '../../application/use-cases/item/degrade-inactive-items.use-case';
import { logger } from '../logging/logger';
const INTERVAL_MS = 60 * 60 * 1000;

export function startItemDegradationScheduler(useCase: DegradeInactiveItemsUseCase): void {
  const run = async (): Promise<void> => {
    try {
      await useCase.execute();
    } catch (err) {
      logger.error({ err }, 'Item degradation scheduler failed');
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
