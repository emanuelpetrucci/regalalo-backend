import { Pool } from 'pg';
import { User } from '../../../domain/entities/user.entity';
import type { AppPreferredLanguage } from '../../../interfaces/validators/preferred-language.schema';
import {
  IUserRepository,
  CreateUserInput,
  ReputationEventRecord,
  UserDeliverySessionRecord,
  FindMyDeliverySessionsInput,
  UserItemRecord,
  FindMyItemsInput,
  UserRequestRecord,
  FindMyRequestsInput,
  UpdateProfileInput,
  UpdateVerificationTokenInput,
  AdminUserRecord,
  AdminUserDetailRecord,
  AdminReputationEventRecord,
} from '../../../domain/repositories/user.repository';
import type { AdminUserListQuery } from '../../../application/dtos/admin/admin-user-list.dto';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';
import { logger } from '../../logging/logger';
import { extractStoragePathFromPublicUrl } from '../../storage/extract-storage-path';
import { RANKED_ELIGIBLE_REQUESTER_SQL } from '../sql/ranked-candidate-filters';

type UserDbRow = {
  id: string;
  email: string;
  password_hash: string;
  postal_code: string;
  location_name: string | null;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  email_verified: boolean;
  verification_token_hash: string | null;
  verification_token_expires_at: Date | null;
  verification_resend_at: Date | null;
  is_active: boolean;
  preferred_language: string;
  reputation_score: number;
  total_received: number;
  total_donated: number;
  consecutive_no_shows: number;
  cycles_at_limit: number;
  last_cycle_incremented_at: Date | null;
  jwt_version: number;
  created_at: Date;
  last_active_at: Date | null;
};

const USER_SELECT_COLUMNS = `id, email, password_hash, postal_code, location_name,
  first_name, last_name, avatar_url, phone, email_verified,
  verification_token_hash, verification_token_expires_at, verification_resend_at,
  is_active, preferred_language,
  reputation_score, total_received, total_donated, consecutive_no_shows, cycles_at_limit,
  last_cycle_incremented_at, jwt_version, created_at, last_active_at`;

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly db: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<UserDbRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<UserDbRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByVerificationTokenHash(tokenHash: string): Promise<User | null> {
    const result = await this.db.query<UserDbRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users
       WHERE verification_token_hash = $1 AND email_verified = FALSE`,
      [tokenHash],
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateVerificationToken(input: UpdateVerificationTokenInput): Promise<void> {
    await this.db.query(
      `UPDATE users
       SET
         verification_token_hash = $2,
         verification_token_expires_at = $3,
         verification_resend_at = $4
       WHERE id = $1`,
      [input.userId, input.tokenHash, input.expiresAt, input.resendAt],
    );
  }

  async markEmailVerified(userId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE users
         SET
           email_verified = TRUE,
           verification_token_hash = NULL,
           verification_token_expires_at = NULL,
           verification_resend_at = NULL
         WHERE id = $1 AND email_verified = FALSE`,
        [userId],
      );
      if ((result.rowCount ?? 0) !== 1) {
        throw new BadRequestException();
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const result = await this.db.query<UserDbRow>(
        `INSERT INTO users (
           email, password_hash, postal_code, location_name, location, jwt_version,
           first_name, last_name, phone,
           email_verified, is_active, preferred_language,
           verification_token_hash, verification_token_expires_at, verification_resend_at
         )
         VALUES (
           $1, $2, $3, $4, ST_MakePoint($5, $6)::geography, 1,
           $7, $8, $9,
           FALSE, TRUE, $10,
           $11, $12, $13
         )
         RETURNING ${USER_SELECT_COLUMNS}`,
        [
          input.email,
          input.passwordHash,
          input.postalCode,
          input.locationName,
          input.lon,
          input.lat,
          input.firstName,
          input.lastName,
          input.phone ?? null,
          input.preferredLanguage ?? 'es',
          input.verificationTokenHash,
          input.verificationTokenExpiresAt,
          input.verificationResendAt,
        ],
      );

      if (!result.rows[0]) throw new Error('User creation returned no rows unexpectedly');
      return this.mapRow(result.rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException();
      throw err;
    }
  }

  async updateProfile(input: UpdateProfileInput): Promise<User> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (input.firstName !== undefined) {
        setClauses.push(`first_name = $${paramIdx++}`);
        params.push(input.firstName);
      }
      if (input.lastName !== undefined) {
        setClauses.push(`last_name = $${paramIdx++}`);
        params.push(input.lastName);
      }
      if (input.avatarUrl !== undefined) {
        setClauses.push(`avatar_url = $${paramIdx++}`);
        params.push(input.avatarUrl);
      }
      if (input.phone !== undefined) {
        setClauses.push(`phone = $${paramIdx++}`);
        params.push(input.phone);
      }
      if (input.preferredLanguage !== undefined) {
        setClauses.push(`preferred_language = $${paramIdx++}`);
        params.push(input.preferredLanguage);
      }
      if (
        input.postalCode !== undefined &&
        input.lat !== undefined &&
        input.lon !== undefined
      ) {
        setClauses.push(`postal_code = $${paramIdx++}`);
        params.push(input.postalCode);
        if (input.locationName !== undefined) {
          setClauses.push(`location_name = $${paramIdx++}`);
          params.push(input.locationName);
        }
        const lonIdx = paramIdx++;
        const latIdx = paramIdx++;
        setClauses.push(`location = ST_MakePoint($${lonIdx}, $${latIdx})::geography`);
        params.push(input.lon, input.lat);
        if (input.incrementJwtVersion) {
          setClauses.push('jwt_version = jwt_version + 1');
        }
      }

      if (setClauses.length === 0) {
        throw new Error('updateProfile called with no fields to update');
      }

      params.push(input.userId);
      const userIdIdx = paramIdx;

      const result = await client.query<UserDbRow>(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${userIdIdx} RETURNING ${USER_SELECT_COLUMNS}`,
        params,
      );

      if (result.rows.length === 0) {
        throw new Error('User update returned no rows unexpectedly');
      }

      if (input.avatarUrl === null && input.previousAvatarUrl) {
        const storagePath = extractStoragePathFromPublicUrl(input.previousAvatarUrl);
        if (storagePath && storagePath.startsWith(`avatars/${input.userId}/`)) {
          await client.query(
            'INSERT INTO storage_deletion_queue (storage_path) VALUES ($1)',
            [storagePath],
          );
        } else if (storagePath) {
          logger.warn(
            { userId: input.userId, avatarUrl: input.previousAvatarUrl, storagePath },
            'Prevented deletion of avatar not belonging to user',
          );
        } else {
          logger.warn(
            { userId: input.userId, avatarUrl: input.previousAvatarUrl },
            'Could not derive storage path from previous avatar URL; skipping deletion queue',
          );
        }
      }

      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findReputationHistory(userId: string): Promise<ReputationEventRecord[]> {
    const result = await this.db.query<{
      id: string;
      type: 'delivery_completed' | 'no_show';
      delta: number;
      session_id: string | null;
      created_at: Date;
      role: 'donor' | 'receiver' | null;
    }>(
      `SELECT id, type, delta, session_id, created_at, role
       FROM reputation_events
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      delta: row.delta,
      sessionId: row.session_id,
      createdAt: row.created_at,
      role: row.role,
    }));
  }

  async findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }> {
    const { userId, role, status, page, limit } = input;
    const params: unknown[] = [userId];
    let roleCondition: string;

    if (role === 'donor') {
      roleCondition = 'ds.donor_id = $1';
    } else if (role === 'receiver') {
      roleCondition = 'ds.receiver_id = $1';
    } else {
      roleCondition = '(ds.donor_id = $1 OR ds.receiver_id = $1)';
    }

    let statusCondition = '';
    if (status) {
      params.push(status);
      statusCondition = `AND ds.status = $${params.length}`;
    }

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM delivery_sessions ds
       WHERE ${roleCondition} ${statusCondition}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await this.db.query<{
      id: string;
      item_id: string;
      item_title: string;
      item_image_path: string | null;
      role: 'donor' | 'receiver';
      status: 'active' | 'completed' | 'cancelled' | 'expired';
      deadline_at: Date;
      created_at: Date;
      completed_at: Date | null;
      other_party_user_id: string;
      other_party_first_name: string;
      other_party_last_name: string;
      other_party_avatar_url: string | null;
    }>(
      `SELECT
         ds.id,
         ds.item_id,
         i.title AS item_title,
         /* requires index: item_images(item_id, created_at, id) */
         (SELECT ii.storage_path FROM item_images ii WHERE ii.item_id = i.id ORDER BY ii.created_at ASC, ii.id ASC LIMIT 1) AS item_image_path,
         CASE WHEN ds.donor_id = $1 THEN 'donor' ELSE 'receiver' END AS role,
         ds.status,
         ds.deadline_at,
         ds.created_at,
         ds.completed_at,
         op.id AS other_party_user_id,
         op.first_name AS other_party_first_name,
         op.last_name AS other_party_last_name,
         op.avatar_url AS other_party_avatar_url
       FROM delivery_sessions ds
       JOIN items i ON i.id = ds.item_id
       JOIN users op ON op.id = CASE
         WHEN ds.donor_id = $1 THEN ds.receiver_id
         ELSE ds.donor_id
       END
       WHERE ${roleCondition} ${statusCondition}
       ORDER BY ds.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return {
      sessions: result.rows.map(row => ({
        id: row.id,
        itemId: row.item_id,
        itemTitle: row.item_title,
        itemImagePath: row.item_image_path ?? null,
        role: row.role,
        status: row.status,
        deadlineAt: row.deadline_at,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        otherPartyUserId: row.other_party_user_id,
        otherPartyFirstName: row.other_party_first_name,
        otherPartyLastName: row.other_party_last_name,
        otherPartyAvatarUrl: row.other_party_avatar_url,
      })),
      total,
    };
  }

  async findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }> {
    const { userId, status, page, limit } = input;
    const params: unknown[] = [userId];

    let statusCondition = '';
    if (status) {
      params.push(status);
      statusCondition = `AND i.status = $${params.length}`;
    }

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM items i WHERE i.donor_id = $1 ${statusCondition}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      category: 'furniture' | 'electronics' | 'clothing' | 'books' | 'toys' | 'kitchen' | 'sports' | 'tools' | 'other';
      condition: 'new' | 'like_new' | 'good' | 'fair';
      status: 'active' | 'reserved' | 'completed' | 'cancelled';
      degraded_at: Date | null;
      image_paths: string[];
      created_at: Date;
      completed_at: Date | null;
      requests_paused: boolean;
      pending_count: string;
    }>(
      `SELECT
         i.id,
         i.slug,
         i.title,
         i.category,
         i.condition,
         i.status,
         i.degraded_at,
         CASE
           WHEN i.status IN ('completed','cancelled')
            AND COALESCE(i.completed_at, NOW()) < NOW() - INTERVAL '30 days'
           THEN ARRAY[]::text[]
           ELSE COALESCE(
             (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
              FROM item_images ii
              WHERE ii.item_id = i.id),
             ARRAY[]::text[]
           )
         END AS image_paths,
         i.created_at,
         i.completed_at,
         i.requests_paused,
         (SELECT COUNT(*)
          FROM item_requests ir
          JOIN users u ON u.id = ir.requester_id
          WHERE ir.item_id = i.id
            AND ir.status = 'pending'
            AND ${RANKED_ELIGIBLE_REQUESTER_SQL}) AS pending_count
       FROM items i
       WHERE i.donor_id = $1 ${statusCondition}
       ORDER BY i.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return {
      items: result.rows.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        category: row.category,
        condition: row.condition,
        status: row.status,
        degradedAt: row.degraded_at,
        imagePaths: row.image_paths,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        requestsPaused: row.requests_paused,
        requestCount: parseInt(row.pending_count ?? '0', 10) || 0,
      })),
      total,
    };
  }

  async findMyRequests(input: FindMyRequestsInput): Promise<{ requests: UserRequestRecord[]; total: number }> {
    const { userId, status, page, limit } = input;
    const params: unknown[] = [userId];

    let statusCondition = '';
    if (status) {
      params.push(status);
      const statusIdx = params.length;
      if (status === 'cancelled') {
        statusCondition = `AND (ir.status = $${statusIdx} OR i.status = 'cancelled')`;
      } else {
        statusCondition = `AND ir.status = $${statusIdx}`;
      }
    }

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM item_requests ir
       JOIN items i ON i.id = ir.item_id
       WHERE ir.requester_id = $1 ${statusCondition}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await this.db.query<{
      id: string;
      item_id: string;
      item_title: string;
      item_status: 'active' | 'reserved' | 'completed' | 'cancelled';
      status: 'pending' | 'selected' | 'rejected' | 'cancelled';
      image_paths: string[];
      created_at: Date;
    }>(
      `SELECT
         ir.id,
         ir.item_id,
         i.title  AS item_title,
         i.status AS item_status,
         ir.status,
         CASE
           WHEN i.status IN ('completed','cancelled')
            AND COALESCE(i.completed_at, NOW()) < NOW() - INTERVAL '30 days'
           THEN ARRAY[]::text[]
           ELSE COALESCE(
             (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
              FROM item_images ii
              WHERE ii.item_id = i.id),
             ARRAY[]::text[]
           )
         END AS image_paths,
         ir.created_at
       FROM item_requests ir
       JOIN items i ON i.id = ir.item_id
       WHERE ir.requester_id = $1 ${statusCondition}
       ORDER BY ir.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return {
      requests: result.rows.map(row => ({
        id: row.id,
        itemId: row.item_id,
        itemTitle: row.item_title,
        itemStatus: row.item_status,
        status: row.status,
        imagePaths: row.image_paths,
        createdAt: row.created_at,
      })),
      total,
    };
  }

  async adminFindAll(query: AdminUserListQuery): Promise<{ users: AdminUserRecord[]; total: number }> {
    const { search, status, emailVerified, page, limit } = query;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(
        `(email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx})`,
      );
    }

    if (status === 'active') {
      conditions.push('is_active = TRUE');
    } else if (status === 'suspended') {
      conditions.push('is_active = FALSE');
    }

    if (emailVerified !== undefined) {
      params.push(emailVerified);
      conditions.push(`email_verified = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await this.db.query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      is_active: boolean;
      email_verified: boolean;
      reputation_score: number;
      total_donated: number;
      total_received: number;
      consecutive_no_shows: number;
      cycles_at_limit: number;
      created_at: Date;
      last_active_at: Date | null;
      is_passive: boolean;
      is_hoarder: boolean;
    }>(
      `SELECT
         id, email, first_name, last_name, is_active, email_verified,
         reputation_score, total_donated, total_received,
         consecutive_no_shows, cycles_at_limit, created_at, last_active_at,
         CASE WHEN total_donated = 0 AND total_received > 0
                   AND last_active_at < NOW() - INTERVAL '60 days'
              THEN true ELSE false END AS is_passive,
         CASE WHEN cycles_at_limit >= 3 AND total_received > 5 * total_donated
              THEN true ELSE false END AS is_hoarder
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return {
      users: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        isActive: row.is_active,
        emailVerified: row.email_verified,
        reputationScore: row.reputation_score,
        totalDonated: row.total_donated,
        totalReceived: row.total_received,
        consecutiveNoShows: row.consecutive_no_shows,
        cyclesAtLimit: row.cycles_at_limit,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        isPassive: row.is_passive,
        isHoarder: row.is_hoarder,
      })),
      total,
    };
  }

  async adminFindById(id: string): Promise<AdminUserDetailRecord | null> {
    const result = await this.db.query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      is_active: boolean;
      email_verified: boolean;
      reputation_score: number;
      total_donated: number;
      total_received: number;
      consecutive_no_shows: number;
      cycles_at_limit: number;
      created_at: Date;
      last_active_at: Date | null;
      avatar_url: string | null;
      phone: string | null;
      postal_code: string;
      preferred_language: string;
      is_passive: boolean;
      is_hoarder: boolean;
      active_items: number;
      completed_items: number;
    }>(
      `SELECT
         id, email, first_name, last_name, is_active, email_verified,
         reputation_score, total_donated, total_received,
         consecutive_no_shows, cycles_at_limit, created_at, last_active_at,
         avatar_url, phone, postal_code, preferred_language,
         CASE WHEN total_donated = 0 AND total_received > 0
                   AND last_active_at < NOW() - INTERVAL '60 days'
              THEN true ELSE false END AS is_passive,
         CASE WHEN cycles_at_limit >= 3 AND total_received > 5 * total_donated
              THEN true ELSE false END AS is_hoarder,
         (SELECT COUNT(*) FROM items
          WHERE donor_id = u.id AND status IN ('active', 'reserved'))::int AS active_items,
         (SELECT COUNT(*) FROM items
          WHERE donor_id = u.id AND status = 'completed')::int AS completed_items
       FROM users u
       WHERE u.id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    const repResult = await this.db.query<{
      id: string;
      type: 'delivery_completed' | 'no_show' | 'admin_correction';
      delta: number;
      session_id: string | null;
      created_at: Date;
    }>(
      `SELECT id, type, delta, session_id, created_at
       FROM reputation_events
       WHERE user_id = $1
         AND type IN ('delivery_completed', 'no_show', 'admin_correction')
       ORDER BY created_at DESC`,
      [id],
    );

    const reputationHistory: AdminReputationEventRecord[] = repResult.rows.map((r) => ({
      id: r.id,
      type: r.type,
      delta: r.delta,
      sessionId: r.session_id,
      createdAt: r.created_at,
    }));

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isActive: row.is_active,
      emailVerified: row.email_verified,
      reputationScore: row.reputation_score,
      totalDonated: row.total_donated,
      totalReceived: row.total_received,
      consecutiveNoShows: row.consecutive_no_shows,
      cyclesAtLimit: row.cycles_at_limit,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      avatarUrl: row.avatar_url,
      phone: row.phone,
      postalCode: row.postal_code,
      preferredLanguage: row.preferred_language,
      isPassive: row.is_passive,
      isHoarder: row.is_hoarder,
      activeItems: row.active_items,
      completedItems: row.completed_items,
      reputationHistory,
    };
  }

  async adminSuspend(userId: string): Promise<number> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `UPDATE users
         SET is_active = FALSE, jwt_version = jwt_version + 1
         WHERE id = $1 AND is_active = TRUE`,
        [userId],
      );

      if (userResult.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new ConflictException('Usuario ya suspendido');
      }

      const itemsResult = await client.query(
        `UPDATE items
         SET requests_paused = TRUE, paused_by_admin = TRUE
         WHERE donor_id = $1 AND status = 'active' AND requests_paused = FALSE`,
        [userId],
      );

      await client.query('COMMIT');
      return itemsResult.rowCount ?? 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async adminReactivate(userId: string): Promise<number> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `UPDATE users SET is_active = TRUE WHERE id = $1 AND is_active = FALSE`,
        [userId],
      );

      if (userResult.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new ConflictException('Usuario ya activo');
      }

      const itemsResult = await client.query(
        `UPDATE items
         SET requests_paused = FALSE, paused_by_admin = FALSE
         WHERE donor_id = $1 AND paused_by_admin = TRUE`,
        [userId],
      );

      await client.query('COMMIT');
      return itemsResult.rowCount ?? 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async adminForceVerification(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE users
       SET
         verification_token_hash = $2,
         verification_token_expires_at = $3,
         verification_resend_at = NOW()
       WHERE id = $1 AND email_verified = FALSE`,
      [userId, tokenHash, expiresAt],
    );

    if (result.rowCount === 0) {
      throw new ConflictException('Email ya verificado');
    }
  }

  async adminCorrectReputation(userId: string, delta: number): Promise<number> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO reputation_events (user_id, type, delta, session_id, role)
         VALUES ($1, 'admin_correction', $2, NULL, NULL)`,
        [userId, delta],
      );

      const result = await client.query<{ reputation_score: number }>(
        `UPDATE users
         SET reputation_score = reputation_score + $2
         WHERE id = $1
         RETURNING reputation_score`,
        [userId, delta],
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundException('Usuario no encontrado');
      }

      await client.query('COMMIT');
      return result.rows[0].reputation_score;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async adminResetNoShows(userId: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE users SET consecutive_no_shows = 0 WHERE id = $1 AND consecutive_no_shows > 0`,
      [userId],
    );

    if (result.rowCount === 0) {
      throw new ConflictException('Contador ya es cero');
    }
  }

  async countTotal(): Promise<number> {
    const result = await this.db.query<{ count: string }>('SELECT COUNT(*)::int AS count FROM users');
    return parseInt(result.rows[0].count, 10);
  }

  async countActive(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE',
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countSuspended(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE is_active = FALSE',
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countUnverifiedOver24h(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM users
       WHERE email_verified = FALSE AND created_at < NOW() - INTERVAL '24 hours'`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countPassive(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM users
       WHERE total_donated = 0 AND total_received > 0
         AND last_active_at < NOW() - INTERVAL '60 days'`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countHoarders(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM users
       WHERE cycles_at_limit >= 3 AND total_received > 5 * total_donated`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  private mapRow(row: UserDbRow): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      postalCode: row.postal_code,
      locationName: row.location_name,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_url,
      phone: row.phone,
      emailVerified: row.email_verified,
      verificationTokenHash: row.verification_token_hash,
      verificationTokenExpiresAt: row.verification_token_expires_at,
      verificationResendAt: row.verification_resend_at,
      isActive: row.is_active,
      preferredLanguage: row.preferred_language as AppPreferredLanguage,
      reputationScore: row.reputation_score,
      totalReceived: row.total_received,
      totalDonated: row.total_donated,
      consecutiveNoShows: row.consecutive_no_shows,
      cyclesAtLimit: row.cycles_at_limit,
      lastCycleIncrementedAt: row.last_cycle_incremented_at,
      jwtVersion: row.jwt_version,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }
}
