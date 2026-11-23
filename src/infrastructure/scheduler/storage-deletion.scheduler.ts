import { StorageAdapter } from '../storage/create-storage-adapter';
import { logger } from '../logging/logger';
const INTERVAL_MS = 10 * 60 * 1000;

export function startStorageDeletionScheduler(storageAdapter: StorageAdapter): void {
  const run = async (): Promise<void> => {
    try {
      await storageAdapter.processDeletionQueue();
    } catch (err) {
      logger.error({ err }, 'Storage deletion scheduler failed');
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
