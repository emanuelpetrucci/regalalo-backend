import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedPausedItem,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const itemPausedScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-item-paused@donor.test',
    firstName: 'Donante',
    lastName: 'Pausado',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-item-paused-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Pausa',
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });
  await seedPausedItem(db, item.id);

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id },
  };
};
