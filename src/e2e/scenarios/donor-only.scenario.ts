import { db } from '../../infrastructure/database/supabase/db';
import { seedVerifiedUser } from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const donorOnlyScenario: E2eScenarioBuilder = async () => {
  const donor = await seedVerifiedUser(db, {
    email: 'e2e-donor-only@donor.test',
    firstName: 'Donante',
    lastName: 'E2E',
  });

  return {
    actors: { donor },
    entities: {},
  };
};
