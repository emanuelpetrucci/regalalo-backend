export interface E2eActorToken {
  id: string;
  email: string;
  password: string;
  token: string;
  firstName: string;
  lastName: string;
}

export interface E2eScenarioEntities {
  itemId?: string;
  itemIds?: string[];
  sessionId?: string;
  requestIds?: string[];
}

export interface E2eScenarioResponse {
  scenario: string;
  actors: Record<string, E2eActorToken>;
  entities: E2eScenarioEntities;
}

export interface E2eActorSeed {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  jwtVersion: number;
}

export interface E2eScenarioBuildResult {
  actors: Record<string, E2eActorSeed>;
  entities: E2eScenarioEntities;
}

export interface E2eScenarioContext {
  scenarioName: string;
}

export type E2eScenarioBuilder = (ctx: E2eScenarioContext) => Promise<E2eScenarioBuildResult>;
