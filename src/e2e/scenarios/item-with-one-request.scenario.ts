import { db } from '../../infrastructure/database/supabase/db';
import {
  createStorageUploader,
  seedActiveItem,
  seedItemRequest,
  seedVerifiedUser,
} from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const itemWithOneRequestScenario: E2eScenarioBuilder = async () => {
  const upload = createStorageUploader();
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-donor-request@donor.test',
    firstName: 'Donante',
    lastName: 'Solicitudes',
  });
  const receiver = await seedVerifiedUser(db, {
    email: 'e2e-receiver-request@receiver.test',
    firstName: 'Receptor',
    lastName: 'Uno',
  });
  const item = await seedActiveItem(db, upload, { donorId: donor.id });
  const requestId = await seedItemRequest(db, {
    itemId: item.id,
    requesterId: receiver.id,
  });

  return {
    actors: { donor, receiver },
    entities: { itemId: item.id, requestIds: [requestId] },
  };
};
