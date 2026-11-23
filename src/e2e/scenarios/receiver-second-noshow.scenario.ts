import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedDeliveryActive,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const receiverSecondNoshowScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-noshow2-donor@donor.test',
    firstName: 'Donante',
    lastName: 'NoShow2',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-noshow2-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Racha',
    reputationScore: 50,
    consecutiveNoShows: 1,
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id, title: 'Objeto no-show x2 E2E' });
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
