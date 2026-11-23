import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedThreePendingRequestsForUser,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const requestLimitReachedScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-request-limit-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Limite',
  });
  const donor1 = await seedVerifiedUser(db, {
    email: 'e2e-request-limit-d1@donor.test',
    firstName: 'Donante',
    lastName: 'Uno',
  });
  const donor2 = await seedVerifiedUser(db, {
    email: 'e2e-request-limit-d2@donor.test',
    firstName: 'Donante',
    lastName: 'Dos',
  });
  const donor3 = await seedVerifiedUser(db, {
    email: 'e2e-request-limit-d3@donor.test',
    firstName: 'Donante',
    lastName: 'Tres',
  });
  const donor4 = await seedVerifiedUser(db, {
    email: 'e2e-request-limit-d4@donor.test',
    firstName: 'Donante',
    lastName: 'Cuatro',
  });

  const { itemIds } = await seedThreePendingRequestsForUser(db, receiver.id, [
    donor1.id,
    donor2.id,
    donor3.id,
  ]);
  const fourthItem = await seedActiveItem(db, upload, {
    donorId: donor4.id,
    title: 'Objeto cuarto intento E2E',
  });

  return {
    actors: { receiver, donor: donor4, donor1, donor2, donor3 },
    entities: { itemIds, itemId: fourthItem.id },
  };
};
