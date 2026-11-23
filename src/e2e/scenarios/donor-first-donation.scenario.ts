import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedDeliveryActive,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const donorFirstDonationScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-first-donation-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Primera',
    totalDonated: 0,
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-first-donation-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Primera',
    reputationScore: 50,
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });
  const requestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: receiver.id,
  });
  const sessionId = await seedDeliveryActive(db, {
    itemId: item.id,
    donorId: donor.id,
    receiverId: receiver.id,
    requestId,
  });

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id, sessionId, requestIds: [requestId] },
  };
};
