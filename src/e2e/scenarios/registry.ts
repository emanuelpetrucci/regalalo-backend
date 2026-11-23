import type { E2eScenarioBuilder } from './types';
import { emptyScenario } from './empty.scenario';
import { donorOnlyScenario } from './donor-only.scenario';
import { publishUiScenario } from './publish-ui.scenario';
import { itemPublishedScenario } from './item-published.scenario';
import { itemWithOneRequestScenario } from './item-with-one-request.scenario';
import { rankingThreeScenario } from './ranking-three.scenario';
import { deliveryActiveScenario } from './delivery-active.scenario';
import { deliveryCompletedScenario } from './delivery-completed.scenario';
import { itemDegradedScenario } from './item-degraded.scenario';
import { itemPausedScenario } from './item-paused.scenario';
import { requestLimitReachedScenario } from './request-limit-reached.scenario';
import { rankingPassiveHiddenScenario } from './ranking-passive-hidden.scenario';
import { rankingHoarderTier1Scenario } from './ranking-hoarder-tier1.scenario';
import { rankingHoarderTier2Scenario } from './ranking-hoarder-tier2.scenario';
import { deliveryWithReceiverChannelScenario } from './delivery-with-receiver-channel.scenario';
import { donorFirstDonationScenario } from './donor-first-donation.scenario';
import { unverifiedUserScenario } from './unverified-user.scenario';
import { receiverSecondNoshowScenario } from './receiver-second-noshow.scenario';

export const scenarioRegistry: Record<string, E2eScenarioBuilder> = {
  empty: emptyScenario,
  'donor-only': donorOnlyScenario,
  'publish-ui': publishUiScenario,
  'item-published': itemPublishedScenario,
  'item-with-one-request': itemWithOneRequestScenario,
  'ranking-three': rankingThreeScenario,
  'delivery-active': deliveryActiveScenario,
  'delivery-completed': deliveryCompletedScenario,
  'item-degraded': itemDegradedScenario,
  'item-paused': itemPausedScenario,
  'request-limit-reached': requestLimitReachedScenario,
  'ranking-passive-hidden': rankingPassiveHiddenScenario,
  'ranking-hoarder-tier1': rankingHoarderTier1Scenario,
  'ranking-hoarder-tier2': rankingHoarderTier2Scenario,
  'delivery-with-receiver-channel': deliveryWithReceiverChannelScenario,
  'donor-first-donation': donorFirstDonationScenario,
  'unverified-user': unverifiedUserScenario,
  'receiver-second-noshow': receiverSecondNoshowScenario,
};

export function resolveScenarioBuilder(name: string): E2eScenarioBuilder | undefined {
  return scenarioRegistry[name];
}
