import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const rankingHoarderTier1Scenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t1-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Tier1',
  });
  const hoarder = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t1@receiver.test',
    firstName: 'Acaparador',
    lastName: 'Tier1',
    reputationScore: 80,
    totalDonated: 0,
    cyclesAtLimit: 1,
  });
  const clean = await seedVerifiedUser(db, {
    email: 'e2e-hoarder-t1-clean@receiver.test',
    firstName: 'Limpio',
    lastName: 'Tier1',
    reputationScore: 70,
  });
  const item = await seedActiveItem(db, upload, {
    donorId: donor.id,
    title: 'Objeto ranking hoarder tier1 E2E',
  });
  const requestIds = await Promise.all([
    seedItemRequest(db, { itemId: item.id, requesterId: hoarder.id }),
    seedItemRequest(db, { itemId: item.id, requesterId: clean.id }),
  ]);

  return {
    actors: { donor, hoarder, clean },
    entities: { itemId: item.id, requestIds },
  };
};
