import { db } from '../../infrastructure/database/supabase/db';
import { createStorageUploader, seedActiveItem, seedVerifiedUser } from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const itemPublishedScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-item-published@donor.test',
    firstName: 'Donante',
    lastName: 'Publicado',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-item-published-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Explorar',
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id },
  };
};
