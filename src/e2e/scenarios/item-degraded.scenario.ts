import { db } from '../../infrastructure/database/supabase/db';
import { degradeItemById } from '../time/degrade-item';
import { createStorageUploader, seedActiveItem, seedVerifiedUser } from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const itemDegradedScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-degraded-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Degradado',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-degraded-viewer@receiver.test',
    firstName: 'Explorador',
    lastName: 'E2E',
  });
  const item = await seedActiveItem(db, upload, {
    donorId: donor.id,
    title: 'Objeto degradado E2E',
  });
  await degradeItemById(db, item.id);

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id },
  };
};
