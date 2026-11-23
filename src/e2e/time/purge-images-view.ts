import type { Pool } from 'pg';
import { backdateItemCompleted } from './backdate-item-completed';

/** Simulates FR34: completed items older than 30 days return empty images on GET. */
export async function purgeImagesViewForItem(pool: Pool, itemId: string): Promise<void> {
  await backdateItemCompleted(pool, itemId, 31);
}
