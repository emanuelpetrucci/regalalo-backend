import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedDeliveryActive,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

const RECEIVER_CONTACT = 'whatsapp:+5491100000099';

export const deliveryWithReceiverChannelScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-delivery-rc-donor@donor.test',
    firstName: 'Donante',
    lastName: 'CanalReceptor',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-delivery-rc-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Canal',
    reputationScore: 50,
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });
  const requestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: receiver.id,
    contactChannel: RECEIVER_CONTACT,
  });
  const sessionId = await seedDeliveryActive(db, {
    itemId: item.id,
    donorId: donor.id,
    receiverId: receiver.id,
    requestId,
    receiverContactChannel: RECEIVER_CONTACT,
  });

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id, sessionId, requestIds: [requestId] },
  };
};
