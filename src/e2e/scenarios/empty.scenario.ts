import type { E2eScenarioBuilder } from './types';

export const emptyScenario: E2eScenarioBuilder = async () => ({
  actors: {},
  entities: {},
});
