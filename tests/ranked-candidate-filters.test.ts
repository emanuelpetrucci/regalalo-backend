import { describe, it, expect } from 'vitest';
import {
  PASSIVE_REQUESTER_SQL,
  RANKED_VISIBLE_REQUESTER_SQL,
  HOARDER_TIER2_EXCLUSION_SQL,
  RANKED_ELIGIBLE_REQUESTER_SQL,
  HOARDER_TIER1_PENALTY_CASE_SQL,
} from '../src/infrastructure/database/sql/ranked-candidate-filters';

describe('ranked-candidate-filters', () => {
  it('treats NULL last_active_at as not passive', () => {
    expect(PASSIVE_REQUESTER_SQL).toContain('last_active_at IS NOT NULL');
  });

  it('exports complementary visibility predicate', () => {
    expect(RANKED_VISIBLE_REQUESTER_SQL).toBe(`NOT ${PASSIVE_REQUESTER_SQL}`);
  });

  it('defines Tier 2 exclusion for hoarders at limit without donations', () => {
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('u.cycles_at_limit >= 2');
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('u.total_donated = 0');
  });

  it('composes eligible requester as FR17 visible AND NOT Tier 2', () => {
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).toContain(RANKED_VISIBLE_REQUESTER_SQL);
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).toContain(`NOT ${HOARDER_TIER2_EXCLUSION_SQL}`);
  });

  it('defines Tier 1 penalty CASE for effective_score ordering only, self-guarded against Tier 2', () => {
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.cycles_at_limit >= 1');
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.total_donated = 0');
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('THEN 15');
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain(`NOT ${HOARDER_TIER2_EXCLUSION_SQL}`);
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).not.toContain('u.cycles_at_limit >= 2 THEN');
  });
});
