import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const rankingThreeScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-ranking-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Ranking',
  });
  const r1 = await seedVerifiedUser(db, {
    email: 'e2e-ranking-r1@receiver.test',
    firstName: 'Receptor',
    lastName: 'Bajo',
    reputationScore: 5,
  });
  const r2 = await seedVerifiedUser(db, {
    email: 'e2e-ranking-r2@receiver.test',
    firstName: 'Receptor',
    lastName: 'Medio',
    reputationScore: 50,
  });
  const r3 = await seedVerifiedUser(db, {
    email: 'e2e-ranking-r3@receiver.test',
    firstName: 'Receptor',
    lastName: 'Alto',
    reputationScore: 95,
  });

  const item = await seedActiveItem(db, upload, {
    donorId: donor.id,
    title: 'Objeto ranking E2E',
  });

  const requestIds = await Promise.all([
    seedItemRequest(db, { itemId: item.id, requesterId: r1.id }),
    seedItemRequest(db, { itemId: item.id, requesterId: r2.id }),
    seedItemRequest(db, { itemId: item.id, requesterId: r3.id }),
  ]);

  return {
    actors: { donor, r1, r2, r3 },
    entities: { itemId: item.id, requestIds },
  };
};
