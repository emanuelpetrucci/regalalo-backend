import { Pool } from 'pg';
import type { AppPreferredLanguage } from '../../../interfaces/validators/preferred-language.schema';
import {
  IDeliverySessionRepository,
  SelectReceiverInput,
  SelectReceiverResult,
  DeliverySessionDetail,
  DeliverySessionParticipantView,
  ConfirmDeliveryResult,
  CancelDeliveryInput,
  CancelDeliveryResult,
  ExpiredSessionForEmail,
  AdminSessionRecord,
  AdminSessionDetailRecord,
  AdminSessionListQuery,
} from '../../../domain/repositories/delivery-session.repository';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';

export class PostgresDeliverySessionRepository implements IDeliverySessionRepository {
  constructor(private readonly db: Pool) {}

  async selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const reqResult = await client.query<{
        requester_id: string;
        req_status: string;
        requester_contact_channel: string | null;
        item_status: string;
        title: string;
        condition: string;
      }>(
        `SELECT ir.requester_id,
                ir.status           AS req_status,
                ir.contact_channel  AS requester_contact_channel,
                i.status            AS item_status,
                i.title,
                i.condition
         FROM item_requests ir
         JOIN items i ON i.id = ir.item_id
         WHERE ir.id = $1 AND ir.item_id = $2
         FOR UPDATE`,
        [input.requestId, input.itemId],
      );

      if (reqResult.rows.length === 0) {
        throw new ForbiddenException('Forbidden');
      }

      const { requester_id, req_status, requester_contact_channel, item_status, title, condition } = reqResult.rows[0];

      if (req_status !== 'pending') {
        throw new ConflictException('Request is not in pending state');
      }
      if (item_status !== 'active') {
        throw new ConflictException('Item is not active');
      }

      const sessionResult = await client.query<{
        id: string;
        deadline_at: Date;
      }>(
        `INSERT INTO delivery_sessions (item_id, donor_id, receiver_id, contact_channel, receiver_contact_channel)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, deadline_at`,
        [input.itemId, input.donorId, requester_id, input.contactChannel, requester_contact_channel],
      );

      await client.query(
        `UPDATE item_requests SET status = 'selected', contact_channel = NULL WHERE id = $1`,
        [input.requestId],
      );

      await client.query(
        `UPDATE item_requests SET status = 'rejected', contact_channel = NULL
         WHERE item_id = $1 AND id != $2 AND status = 'pending'`,
        [input.itemId, input.requestId],
      );

      await client.query(
        `UPDATE items SET status = 'reserved', reserved_at = NOW() WHERE id = $1`,
        [input.itemId],
      );

      await client.query('COMMIT');

      const row = sessionResult.rows[0];
      return {
        sessionId: row.id,
        status: 'active',
        deadlineAt: row.deadline_at,
        receiverId: requester_id,
        itemTitle: title,
        itemCondition: condition,
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const sessionResult = await client.query<{
        donor_id: string;
        receiver_id: string;
        item_id: string;
        created_at: Date;
        status: string;
        donor_confirmed: boolean;
        category: ConfirmDeliveryResult['category'];
        weight_range: ConfirmDeliveryResult['weightRange'];
      }>(
        `SELECT ds.donor_id, ds.receiver_id, ds.item_id, ds.created_at, ds.status, ds.donor_confirmed,
                i.category, i.weight_range
         FROM delivery_sessions ds
         JOIN items i ON i.id = ds.item_id
         WHERE ds.id = $1
         FOR UPDATE`,
        [sessionId],
      );

      if (sessionResult.rows.length === 0) {
        throw new NotFoundException('Sesión no encontrada');
      }

      const {
        donor_id,
        receiver_id,
        item_id,
        created_at,
        status,
        donor_confirmed,
        category,
        weight_range,
      } = sessionResult.rows[0];

      if (donor_id !== donorId) {
        throw new ForbiddenException('Forbidden');
      }
      if (status !== 'active') {
        throw new ConflictException('Session is not active');
      }
      if (donor_confirmed) {
        throw new ConflictException('Delivery already confirmed');
      }

      const updateResult = await client.query<{ completed_at: Date }>(
        `UPDATE delivery_sessions
         SET donor_confirmed = TRUE, status = 'completed', completed_at = NOW()
         WHERE id = $1
         RETURNING completed_at`,
        [sessionId],
      );

      if (updateResult.rows.length === 0) {
        throw new NotFoundException('Sesión no encontrada');
      }

      const donorBeforeResult = await client.query<{ total_donated: number }>(
        `SELECT total_donated FROM users WHERE id = $1 FOR UPDATE`,
        [donor_id],
      );

      const donorDelta = donorBeforeResult.rows[0].total_donated === 0 ? 15 : 10;
      const receiverDelta = 1;

      const donorScoreResult = await client.query<{ reputation_score: number }>(
        `UPDATE users
         SET reputation_score = reputation_score + $2,
             consecutive_no_shows = 0,
             total_donated = total_donated + 1
         WHERE id = $1
         RETURNING reputation_score`,
        [donor_id, donorDelta],
      );

      const receiverScoreResult = await client.query<{ reputation_score: number }>(
        `UPDATE users
         SET reputation_score = reputation_score + 1,
             consecutive_no_shows = 0,
             total_received = total_received + 1
         WHERE id = $1
         RETURNING reputation_score`,
        [receiver_id],
      );

      await client.query(
        `INSERT INTO reputation_events (user_id, type, delta, session_id, role) VALUES
           ($1, 'delivery_completed', $4, $3, 'donor'),
           ($2, 'delivery_completed', 1, $3, 'receiver')`,
        [donor_id, receiver_id, sessionId, donorDelta],
      );

      await client.query(
        `UPDATE items SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [item_id],
      );

      await client.query('COMMIT');

      return {
        completedAt: updateResult.rows[0].completed_at,
        donorId: donor_id,
        receiverId: receiver_id,
        donorNewScore: donorScoreResult.rows[0].reputation_score,
        receiverNewScore: receiverScoreResult.rows[0].reputation_score,
        donorDelta,
        receiverDelta,
        itemId: item_id,
        sessionCreatedAt: created_at,
        category,
        weightRange: weight_range,
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelDelivery(input: CancelDeliveryInput): Promise<CancelDeliveryResult> {
    const { sessionId, donorId, noShow } = input;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const sessionResult = await client.query<{
        donor_id: string;
        receiver_id: string;
        item_id: string;
        created_at: Date;
        status: string;
        category: CancelDeliveryResult['category'];
      }>(
        `SELECT ds.donor_id, ds.receiver_id, ds.item_id, ds.created_at, ds.status, i.category
         FROM delivery_sessions ds
         JOIN items i ON i.id = ds.item_id
         WHERE ds.id = $1
         FOR UPDATE`,
        [sessionId],
      );

      if (sessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundException('Sesión no encontrada');
      }

      const { donor_id, receiver_id, item_id, created_at, status, category } = sessionResult.rows[0];

      if (donor_id !== donorId) {
        await client.query('ROLLBACK');
        throw new ForbiddenException('Forbidden');
      }
      if (status !== 'active') {
        await client.query('ROLLBACK');
        throw new ConflictException('Session is not active');
      }

      const updateResult = await client.query<{ completed_at: Date }>(
        `UPDATE delivery_sessions
         SET no_show_declared = $1, status = 'cancelled', completed_at = NOW()
         WHERE id = $2
         RETURNING completed_at`,
        [noShow, sessionId],
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundException('Sesión no encontrada');
      }

      let receiverId: string | undefined;
      let receiverNewScore: number | undefined;
      let receiverConsecutiveNoShows: number | undefined;
      let receiverDelta: number | undefined;

      if (noShow) {
        const noShowResult = await client.query<{ consecutive_no_shows: number }>(
          `UPDATE users
           SET consecutive_no_shows = consecutive_no_shows + 1
           WHERE id = $1
           RETURNING consecutive_no_shows`,
          [receiver_id],
        );

        if (noShowResult.rows.length === 0) {
          await client.query('ROLLBACK');
          throw new NotFoundException('Receptor no encontrado');
        }

        const newConsecutiveNoShows = noShowResult.rows[0].consecutive_no_shows;
        const delta = -10 * newConsecutiveNoShows;

        const receiverScoreResult = await client.query<{ reputation_score: number }>(
          `UPDATE users SET reputation_score = reputation_score + $1 WHERE id = $2 RETURNING reputation_score`,
          [delta, receiver_id],
        );

        await client.query(
          `INSERT INTO reputation_events (user_id, type, delta, session_id, role)
           VALUES ($1, 'no_show', $2, $3, 'receiver')`,
          [receiver_id, delta, sessionId],
        );

        receiverId = receiver_id;
        receiverNewScore = receiverScoreResult.rows[0].reputation_score;
        receiverConsecutiveNoShows = newConsecutiveNoShows;
        receiverDelta = delta;
      }

      await client.query(
        `UPDATE items SET status = 'active', reserved_at = NULL WHERE id = $1`,
        [item_id],
      );

      await client.query(
        `UPDATE item_requests SET status = 'pending' WHERE item_id = $1 AND status IN ('selected', 'rejected')`,
        [item_id],
      );

      await client.query(
        `UPDATE item_requests ir
         SET contact_channel = ds.receiver_contact_channel
         FROM delivery_sessions ds
         WHERE ds.id = $1
           AND ir.item_id = ds.item_id
           AND ir.requester_id = ds.receiver_id
           AND ir.status = 'pending'`,
        [sessionId],
      );

      await client.query('COMMIT');

      return {
        noShowDeclared: noShow,
        completedAt: updateResult.rows[0].completed_at,
        itemId: item_id,
        sessionCreatedAt: created_at,
        category,
        receiverId,
        receiverNewScore,
        receiverConsecutiveNoShows,
        receiverDelta,
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async findExpiredSessions(): Promise<ExpiredSessionForEmail[]> {
    const result = await this.db.query<{
      session_id: string;
      donor_id: string;
      created_at: Date;
      donor_email: string;
      donor_first_name: string;
      donor_preferred_language: string;
      item_id: string;
      item_title: string;
      category: ExpiredSessionForEmail['category'];
    }>(
      `SELECT ds.id AS session_id,
              ds.donor_id,
              ds.created_at,
              u.email AS donor_email,
              u.first_name AS donor_first_name,
              u.preferred_language AS donor_preferred_language,
              i.id AS item_id,
              i.title AS item_title,
              i.category
       FROM delivery_sessions ds
       JOIN users u ON u.id = ds.donor_id
       JOIN items i ON i.id = ds.item_id
       WHERE ds.status = 'expired'
         AND ds.deadline_at >= NOW() - INTERVAL '75 minutes'`,
    );
    return result.rows.map(row => ({
      sessionId: row.session_id,
      donorId: row.donor_id,
      createdAt: row.created_at,
      donorEmail: row.donor_email,
      donorFirstName: row.donor_first_name,
      donorPreferredLanguage: row.donor_preferred_language as AppPreferredLanguage,
      itemId: row.item_id,
      itemTitle: row.item_title,
      category: row.category,
    }));
  }

  async findByIdForParticipant(
    sessionId: string,
    currentUserId: string,
  ): Promise<DeliverySessionParticipantView | null> {
    const result = await this.db.query<{
      id: string;
      item_id: string;
      donor_id: string;
      receiver_id: string;
      status: 'active' | 'completed' | 'cancelled' | 'expired';
      contact_channel: string | null;
      contact_purged: boolean;
      receiver_contact_channel: string | null;
      receiver_contact_purged: boolean;
      donor_confirmed: boolean;
      no_show_declared: boolean;
      deadline_at: Date;
      created_at: Date;
      completed_at: Date | null;
      item_title: string;
      item_condition: string;
      item_category:
        | 'furniture'
        | 'electronics'
        | 'clothing'
        | 'books'
        | 'toys'
        | 'kitchen'
        | 'sports'
        | 'tools'
        | 'other';
      item_image_paths: string[] | null;
      other_party_id: string;
      other_party_first_name: string;
      other_party_last_name: string;
      other_party_avatar_url: string | null;
      other_party_reputation_score: number;
      other_party_distance_meters: number;
      other_party_location_name: string | null;
    }>(
      `SELECT
         ds.id,
         ds.item_id,
         ds.donor_id,
         ds.receiver_id,
         ds.status,
         ds.contact_channel,
         ds.contact_purged,
         ds.receiver_contact_channel,
         ds.receiver_contact_purged,
         ds.donor_confirmed,
         ds.no_show_declared,
         ds.deadline_at,
         ds.created_at,
         ds.completed_at,
         i.title AS item_title,
         i.condition AS item_condition,
         i.category AS item_category,
         CASE
           WHEN i.status IN ('completed', 'cancelled')
            AND COALESCE(i.completed_at, NOW()) < NOW() - INTERVAL '30 days'
           THEN ARRAY[]::text[]
           ELSE COALESCE(
             (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
              FROM item_images ii
              WHERE ii.item_id = i.id),
             ARRAY[]::text[]
           )
         END AS item_image_paths,
         other_u.id AS other_party_id,
         other_u.first_name AS other_party_first_name,
         other_u.last_name AS other_party_last_name,
         other_u.avatar_url AS other_party_avatar_url,
         other_u.reputation_score AS other_party_reputation_score,
         COALESCE(ROUND(ST_Distance(i.location, other_u.location))::int, 0) AS other_party_distance_meters,
         other_u.location_name AS other_party_location_name
       FROM delivery_sessions ds
       JOIN items i ON i.id = ds.item_id
       JOIN users other_u ON other_u.id = CASE
         WHEN ds.donor_id = $2 THEN ds.receiver_id
         ELSE ds.donor_id
       END
       WHERE ds.id = $1`,
      [sessionId, currentUserId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      itemId: row.item_id,
      donorId: row.donor_id,
      receiverId: row.receiver_id,
      status: row.status,
      contactChannel: row.contact_channel,
      contactPurged: row.contact_purged,
      receiverContactChannel: row.receiver_contact_channel,
      receiverContactPurged: row.receiver_contact_purged,
      donorConfirmed: row.donor_confirmed,
      noShowDeclared: row.no_show_declared,
      deadlineAt: row.deadline_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      itemTitle: row.item_title,
      itemCondition: row.item_condition,
      itemCategory: row.item_category,
      itemImagePaths: row.item_image_paths ?? [],
      otherPartyUserId: row.other_party_id,
      otherPartyFirstName: row.other_party_first_name,
      otherPartyLastName: row.other_party_last_name,
      otherPartyAvatarUrl: row.other_party_avatar_url,
      otherPartyReputationScore: row.other_party_reputation_score,
      otherPartyDistanceMeters: row.other_party_distance_meters,
      otherPartyLocationName: row.other_party_location_name,
    };
  }

  async findById(sessionId: string): Promise<DeliverySessionDetail | null> {
    const result = await this.db.query<{
      id: string;
      item_id: string;
      donor_id: string;
      receiver_id: string;
      status: 'active' | 'completed' | 'cancelled' | 'expired';
      contact_channel: string | null;
      contact_purged: boolean;
      receiver_contact_channel: string | null;
      receiver_contact_purged: boolean;
      donor_confirmed: boolean;
      no_show_declared: boolean;
      deadline_at: Date;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, item_id, donor_id, receiver_id, status, contact_channel, contact_purged,
              receiver_contact_channel, receiver_contact_purged,
              donor_confirmed, no_show_declared, deadline_at, created_at, completed_at
       FROM delivery_sessions
       WHERE id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      itemId: row.item_id,
      donorId: row.donor_id,
      receiverId: row.receiver_id,
      status: row.status,
      contactChannel: row.contact_channel,
      contactPurged: row.contact_purged,
      receiverContactChannel: row.receiver_contact_channel,
      receiverContactPurged: row.receiver_contact_purged,
      donorConfirmed: row.donor_confirmed,
      noShowDeclared: row.no_show_declared,
      deadlineAt: row.deadline_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  async adminFindAll(query: AdminSessionListQuery): Promise<{ sessions: AdminSessionRecord[]; total: number }> {
    const { status, overdue, userId, page, limit } = query;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`ds.status = $${idx++}`);
      params.push(status);
    }
    if (overdue) {
      if (!status) conditions.push(`ds.status = 'active'`);
      conditions.push(`ds.deadline_at < NOW()`);
    }
    if (userId) {
      conditions.push(`(ds.donor_id = $${idx++} OR ds.receiver_id = $${idx - 1})`);
      params.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM delivery_sessions ds
       ${where}`,
      params,
    );

    const dataResult = await this.db.query<{
      id: string;
      status: 'active' | 'completed' | 'cancelled' | 'expired';
      deadline_at: Date;
      created_at: Date;
      completed_at: Date | null;
      contact_purged: boolean;
      no_show_declared: boolean;
      item_id: string;
      item_title: string;
      donor_id: string;
      donor_first_name: string;
      donor_last_name: string;
      donor_email: string;
      receiver_id: string;
      receiver_first_name: string;
      receiver_last_name: string;
      receiver_email: string;
    }>(
      `SELECT
         ds.id,
         ds.status,
         ds.deadline_at,
         ds.created_at,
         ds.completed_at,
         ds.contact_purged,
         ds.no_show_declared,
         i.id AS item_id,
         i.title AS item_title,
         donor.id AS donor_id,
         donor.first_name AS donor_first_name,
         donor.last_name AS donor_last_name,
         donor.email AS donor_email,
         receiver.id AS receiver_id,
         receiver.first_name AS receiver_first_name,
         receiver.last_name AS receiver_last_name,
         receiver.email AS receiver_email
       FROM delivery_sessions ds
       JOIN items i ON i.id = ds.item_id
       JOIN users donor ON donor.id = ds.donor_id
       JOIN users receiver ON receiver.id = ds.receiver_id
       ${where}
       ORDER BY ds.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return {
      sessions: dataResult.rows.map(row => ({
        id: row.id,
        status: row.status,
        deadlineAt: row.deadline_at,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        contactPurged: row.contact_purged,
        noShowDeclared: row.no_show_declared,
        itemId: row.item_id,
        itemTitle: row.item_title,
        donorId: row.donor_id,
        donorFirstName: row.donor_first_name,
        donorLastName: row.donor_last_name,
        donorEmail: row.donor_email,
        receiverId: row.receiver_id,
        receiverFirstName: row.receiver_first_name,
        receiverLastName: row.receiver_last_name,
        receiverEmail: row.receiver_email,
      })),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async adminFindById(sessionId: string): Promise<AdminSessionDetailRecord | null> {
    const result = await this.db.query<{
      id: string;
      status: 'active' | 'completed' | 'cancelled' | 'expired';
      deadline_at: Date;
      created_at: Date;
      completed_at: Date | null;
      contact_channel: string | null;
      contact_purged: boolean;
      donor_confirmed: boolean;
      no_show_declared: boolean;
      item_id: string;
      item_title: string;
      item_category: AdminSessionDetailRecord['itemCategory'];
      item_status: string;
      item_reserved_at: Date | null;
      donor_id: string;
      donor_first_name: string;
      donor_last_name: string;
      donor_email: string;
      receiver_id: string;
      receiver_first_name: string;
      receiver_last_name: string;
      receiver_email: string;
    }>(
      `SELECT
         ds.id,
         ds.status,
         ds.deadline_at,
         ds.created_at,
         ds.completed_at,
         CASE WHEN ds.contact_purged THEN NULL ELSE ds.contact_channel END AS contact_channel,
         ds.contact_purged,
         ds.donor_confirmed,
         ds.no_show_declared,
         i.id AS item_id,
         i.title AS item_title,
         i.category AS item_category,
         i.status AS item_status,
         i.reserved_at AS item_reserved_at,
         donor.id AS donor_id,
         donor.first_name AS donor_first_name,
         donor.last_name AS donor_last_name,
         donor.email AS donor_email,
         receiver.id AS receiver_id,
         receiver.first_name AS receiver_first_name,
         receiver.last_name AS receiver_last_name,
         receiver.email AS receiver_email
       FROM delivery_sessions ds
       JOIN items i ON i.id = ds.item_id
       JOIN users donor ON donor.id = ds.donor_id
       JOIN users receiver ON receiver.id = ds.receiver_id
       WHERE ds.id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      deadlineAt: row.deadline_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      contactChannel: row.contact_channel,
      contactPurged: row.contact_purged,
      donorConfirmed: row.donor_confirmed,
      noShowDeclared: row.no_show_declared,
      itemId: row.item_id,
      itemTitle: row.item_title,
      itemCategory: row.item_category,
      itemStatus: row.item_status,
      itemReservedAt: row.item_reserved_at,
      donorId: row.donor_id,
      donorFirstName: row.donor_first_name,
      donorLastName: row.donor_last_name,
      donorEmail: row.donor_email,
      receiverId: row.receiver_id,
      receiverFirstName: row.receiver_first_name,
      receiverLastName: row.receiver_last_name,
      receiverEmail: row.receiver_email,
    };
  }

  async adminForceExpireSession(sessionId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const sessionResult = await client.query<{ item_id: string }>(
        `UPDATE delivery_sessions
         SET status = 'expired', completed_at = NOW()
         WHERE id = $1 AND status = 'active'
         RETURNING item_id`,
        [sessionId],
      );

      if (sessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new ConflictException('Session is no longer active');
      }

      const { item_id } = sessionResult.rows[0];

      await client.query(
        `UPDATE items SET status = 'active', reserved_at = NULL WHERE id = $1`,
        [item_id],
      );

      await client.query(
        `UPDATE item_requests SET status = 'pending' WHERE item_id = $1 AND status IN ('selected', 'rejected')`,
        [item_id],
      );

      await client.query(
        `UPDATE item_requests ir
         SET contact_channel = ds.receiver_contact_channel
         FROM delivery_sessions ds
         WHERE ds.id = $1
           AND ir.item_id = ds.item_id
           AND ir.requester_id = ds.receiver_id
           AND ir.status = 'pending'`,
        [sessionId],
      );

      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async countActive(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM delivery_sessions WHERE status = 'active'`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countByStatusLast30Days(): Promise<{ completed: number; expired: number; cancelled: number }> {
    const result = await this.db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int AS count
       FROM delivery_sessions
       WHERE status IN ('completed', 'expired', 'cancelled')
         AND completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY status`,
    );
    const counts = { completed: 0, expired: 0, cancelled: 0 };
    for (const row of result.rows) {
      if (row.status === 'completed') counts.completed = parseInt(row.count, 10);
      else if (row.status === 'expired') counts.expired = parseInt(row.count, 10);
      else if (row.status === 'cancelled') counts.cancelled = parseInt(row.count, 10);
    }
    return counts;
  }

  async countNoShowLast30Days(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM delivery_sessions
       WHERE no_show_declared = TRUE
         AND completed_at >= NOW() - INTERVAL '30 days'`,
    );
    return parseInt(result.rows[0].count, 10);
  }
}
