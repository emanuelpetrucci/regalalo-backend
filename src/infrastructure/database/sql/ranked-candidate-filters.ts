/**
 * FR17 — passive requesters are excluded from ranked lists and donor-facing pending counts.
 * NULL last_active_at does not qualify as inactive for 60 days.
 */
export const PASSIVE_REQUESTER_SQL = `(
  u.total_donated = 0
  AND u.total_received > 0
  AND u.last_active_at IS NOT NULL
  AND u.last_active_at < NOW() - INTERVAL '60 days'
)`;

/** Use in WHERE with users aliased as `u`. */
export const RANKED_VISIBLE_REQUESTER_SQL = `NOT ${PASSIVE_REQUESTER_SQL}`;

/**
 * RFC-003 Tier 2 — excluded from ranking and requestCount (users aliased as `u`).
 * Tier 2 prevails over Tier 1: excluded users never reach the penalty CASE.
 */
export const HOARDER_TIER2_EXCLUSION_SQL = `(
  u.cycles_at_limit >= 2
  AND u.total_donated = 0
)`;

/**
 * FR17 + RFC-003 Tier 2 — visibility predicate for ranking WHERE and requestCount.
 * Does not include Tier 1 penalty (ordering only).
 */
export const RANKED_ELIGIBLE_REQUESTER_SQL = `(
  ${RANKED_VISIBLE_REQUESTER_SQL}
  AND NOT ${HOARDER_TIER2_EXCLUSION_SQL}
)`;

/**
 * RFC-003 Tier 1 — subtract from effective_score in ranking ORDER BY only.
 * Self-guarded: explicitly excludes Tier 2 users via NOT HOARDER_TIER2_EXCLUSION_SQL
 * so the fragment is correct in isolation, independent of the WHERE clause.
 * Users with total_donated >= 1 are never penalized (QA-11).
 */
export const HOARDER_TIER1_PENALTY_CASE_SQL = `CASE
  WHEN (
    u.cycles_at_limit >= 1
    AND u.total_donated = 0
    AND NOT ${HOARDER_TIER2_EXCLUSION_SQL}
  )
  THEN 15
  ELSE 0
END`;
