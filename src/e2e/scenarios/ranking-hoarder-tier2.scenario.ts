import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const rankingHoarderTier2Scenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t2-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Tier2',
  });
  const hoarder = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t2@receiver.test',
    firstName: 'Acaparador',
    lastName: 'Tier2',
    totalDonated: 0,
    cyclesAtLimit: 2,
  });
  const clean = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t2-clean@receiver.test',
    firstName: 'Limpio',
    lastName: 'Tier2',
    reputationScore: 70,
  });
  const item = await seedActiveItem(db, upload, {
    donorId: donor.id,
    title: 'Objeto ranking hoarder tier2 E2E',
  });
  const hoarderRequestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: hoarder.id,
  });
  const cleanRequestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: clean.id,
  });

  return {
    actors: { donor, hoarder, clean },
    entities: { itemId: item.id, requestIds: [hoarderRequestId, cleanRequestId] },
  };
};
