import { db } from '../../infrastructure/database/supabase/db';
import { seedUnverifiedUser } from '../seed-helpers';
import type { E2eScenarioBuilder } from './types';

export const unverifiedUserScenario: E2eScenarioBuilder = async () => {
  const user = await seedUnverifiedUser(db, {
    email: 'e2e-unverified@user.test',
    firstName: 'Sin',
    lastName: 'Verificar',
  });

  return {
    actors: { user },
    entities: {},
  };
};
