import type { Pool } from 'pg';

export async function purgeContactChannelForSession(
  pool: Pool,
  sessionId: string,
): Promise<void> {
  await pool.query(
    `UPDATE delivery_sessions
     SET completed_at = NOW() - INTERVAL '8 days'
     WHERE id = $1`,
    [sessionId],
  );
  await pool.query(
    `UPDATE delivery_sessions
     SET contact_channel = NULL,
         contact_purged = TRUE,
         receiver_contact_channel = NULL,
         receiver_contact_purged = TRUE
     WHERE id = $1
       AND (contact_purged = FALSE OR receiver_contact_purged = FALSE)
       AND status IN ('completed', 'cancelled', 'expired')
       AND completed_at < NOW() - INTERVAL '7 days'`,
    [sessionId],
  );
}
