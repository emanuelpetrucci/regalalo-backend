import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedDeliveryCompleted,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const deliveryCompletedScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-completed-donor@donor.test',
    firstName: 'Donante',
    lastName: 'Completado',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-completed-receiver@receiver.test',
    firstName: 'Receptor',
    lastName: 'Completado',
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });
  const sessionId = await seedDeliveryCompleted(db, {
    itemId: item.id,
    donorId: donor.id,
    receiverId: receiver.id,
  });

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id, sessionId },
  };
};
