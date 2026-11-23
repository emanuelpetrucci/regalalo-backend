import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

const SIXTY_ONE_DAYS_MS = 61 * 24 * 60 * 60 * 1000;

export const rankingPassiveHiddenScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-passive-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Pasivo',
  });
  const passive = await seedVerifiedUser(db, {
    email: 'e2e-passive@receiver.test',
    firstName: 'Pasivo',
    lastName: 'E2E',
    totalDonated: 0,
    totalReceived: 1,
    lastActiveAt: new Date(Date.now() - SIXTY_ONE_DAYS_MS),
  });
  const item = await seedActiveItem(db, upload, {
    donorId: donor.id,
    title: 'Objeto ranking pasivo E2E',
  });
  const passiveRequestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: passive.id,
  });

  return {
    actors: { donor, passive },
    entities: { itemId: item.id, requestIds: [passiveRequestId] },
  };
};
