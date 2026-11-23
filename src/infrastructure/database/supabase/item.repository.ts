import { Pool, PoolClient } from 'pg';
import type { AppPreferredLanguage } from '../../../interfaces/validators/preferred-language.schema';
import { allocateSlug, slugBase } from '../../../domain/slug';
import {
  IItemRepository,
  CreateItemInput,
  FindActiveInRadiusInput,
  PaginatedItems,
  FindItemByIdInput,
  FindItemBySlugInput,
  ItemDetail,
  ItemForReport,
  FindItemOwnershipResult,
  NewlyDegradedItem,
  CancelItemResult,
  PendingDigestItem,
  DigestEligibleUser,
  AdminItemRecord,
  AdminItemDetailRecord,
  AdminItemRequestRecord,
  AdminItemSessionRecord,
} from '../../../domain/repositories/item.repository';
import { AdminItemListQuery } from '../../../application/dtos/admin/admin-item-list.dto';
import {
  Item,
  ItemCategory,
  ItemCondition,
  ItemStatus,
  ItemWeightRange,
} from '../../../domain/entities/item.entity';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';

const RADIUS_METERS = 50000;
const SLUG_UNIQUE_INDEX = 'idx_items_slug';
const SLUG_INSERT_ATTEMPTS = 8;

type ItemDbRow = {
  id: string;
  slug: string;
  donor_id: string;
  title: string;
  description: string;
  condition: string;
  category: string;
  weight_range: string;
  status: string;
  requests_paused: boolean;
  degraded_at: Date | null;
  created_at: Date;
  reserved_at: Date | null;
  completed_at: Date | null;
};

function isSlugUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr.code !== '23505') return false;
  return pgErr.constraint === SLUG_UNIQUE_INDEX || (pgErr.detail?.includes('(slug)=') ?? false);
}

export class PostgresItemRepository implements IItemRepository {
  constructor(private readonly db: Pool) {}

  async createWithImages(input: CreateItemInput): Promise<Item> {
    const base = slugBase(input.title);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const row = await this.insertItemResolvingSlug(client, input, base);

      for (const storagePath of input.imagePaths) {
        await client.query(
          'INSERT INTO item_images (item_id, storage_path) VALUES ($1, $2)',
          [input.id, storagePath],
        );
      }

      await client.query('COMMIT');
      return this.mapRow(row);
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore — original error is re-thrown
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertItemResolvingSlug(
    client: PoolClient,
    input: CreateItemInput,
    base: string,
  ): Promise<ItemDbRow> {
    let lastSlugConflict: unknown;
    for (let attempt = 0; attempt < SLUG_INSERT_ATTEMPTS; attempt++) {
      await client.query('SAVEPOINT item_slug');
      try {
        const taken = await this.takenSlugs(client, base);
        const slug = allocateSlug(base, taken);
        const result = await client.query<ItemDbRow>(
          `INSERT INTO items (
             id, donor_id, title, description, condition, category, weight_range, location, location_name, status, slug
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, 'active', $11
           )
           RETURNING id, slug, donor_id, title, description, condition, category, weight_range,
                     status, requests_paused, degraded_at, created_at, reserved_at, completed_at`,
          [
            input.id,
            input.donorId,
            input.title,
            input.description,
            input.condition,
            input.category,
            input.weightRange,
            input.lng,
            input.lat,
            input.locationName,
            slug,
          ],
        );
        if (!result.rows[0]) throw new Error('Item creation returned no rows unexpectedly');
        await client.query('RELEASE SAVEPOINT item_slug');
        return result.rows[0];
      } catch (err) {
        try {
          await client.query('ROLLBACK TO SAVEPOINT item_slug');
          await client.query('RELEASE SAVEPOINT item_slug');
        } catch {
          throw err;
        }
        if (!isSlugUniqueViolation(err)) throw err;
        lastSlugConflict = err;
      }
    }
    if (lastSlugConflict instanceof Error) throw lastSlugConflict;
    throw new Error('Could not allocate a unique item slug');
  }

  private async takenSlugs(client: PoolClient, base: string): Promise<string[]> {
    const result = await client.query<{ slug: string }>(
      `SELECT slug FROM items WHERE slug = $1 OR slug LIKE $2`,
      [base, `${base}-%`],
    );
    return result.rows.map((row) => row.slug);
  }

  async findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems> {
    const offset = (input.page - 1) * input.limit;

    if (input.userId === null) {
      const [countResult, listResult] = await Promise.all([
        this.db.query<{ count: string }>(
          `SELECT COUNT(*) FROM items i WHERE i.status = 'active'`,
        ),
        this.db.query<{
          id: string;
          slug: string;
          title: string;
          condition: string;
          category: string;
          degraded_at: Date | null;
          created_at: Date;
          distance_meters: null;
            location_name: string | null;
            image_paths: string[] | null;
          }>(
            `SELECT
               i.id,
               i.slug,
               i.title,
               i.condition,
               i.category,
               i.degraded_at,
               i.created_at,
               NULL::int AS distance_meters,
               i.location_name,
               (
                 SELECT COALESCE(ARRAY_AGG(storage_path ORDER BY created_at), ARRAY[]::text[])
                 FROM item_images
                 WHERE item_id = i.id
               ) AS image_paths
             FROM items i
             WHERE i.status = 'active'
             ORDER BY i.degraded_at NULLS FIRST, i.created_at DESC
             LIMIT $1 OFFSET $2`,
            [input.limit, offset],
          ),
      ]);

      return {
        total: parseInt(countResult.rows[0].count, 10),
        items: listResult.rows.map(row => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          condition: row.condition as ItemCondition,
          category: row.category as ItemCategory,
          degradedAt: row.degraded_at,
          createdAt: row.created_at,
          distanceMeters: null,
          locationName: row.location_name ?? null,
          imagePaths: row.image_paths ?? [],
        })),
      };
    }

    const userLocResult = await this.db.query<{ location: unknown }>(
      'SELECT location FROM users WHERE id = $1',
      [input.userId],
    );
    if (userLocResult.rows.length === 0 || userLocResult.rows[0].location === null) {
      throw new Error('User location not available');
    }

    const [countResult, listResult] = await Promise.all([
      this.db.query<{ count: string }>(
        `WITH user_location AS (
           SELECT location FROM users WHERE id = $1
         )
         SELECT COUNT(*)
         FROM items i
         WHERE i.status = 'active'
           AND i.donor_id != $1
           AND ST_DWithin(
             (SELECT location FROM user_location),
             i.location,
             ${RADIUS_METERS}
           )`,
        [input.userId],
      ),
      this.db.query<{
        id: string;
        slug: string;
        title: string;
        condition: string;
        category: string;
        degraded_at: Date | null;
        created_at: Date;
        distance_meters: number;
        location_name: string | null;
        image_paths: string[] | null;
      }>(
        `WITH user_location AS (
           SELECT location FROM users WHERE id = $1
         )
         SELECT
           i.id,
           i.slug,
           i.title,
           i.condition,
           i.category,
           i.degraded_at,
           i.created_at,
           ROUND(ST_Distance(
             (SELECT location FROM user_location),
             i.location
           ))::int AS distance_meters,
           i.location_name,
           (
             SELECT COALESCE(ARRAY_AGG(storage_path ORDER BY created_at), ARRAY[]::text[])
             FROM item_images
             WHERE item_id = i.id
           ) AS image_paths
         FROM items i
         WHERE i.status = 'active'
           AND i.donor_id != $1
           AND ST_DWithin(
             (SELECT location FROM user_location),
             i.location,
             ${RADIUS_METERS}
           )
         ORDER BY i.degraded_at NULLS FIRST, i.created_at DESC
         LIMIT $2 OFFSET $3`,
        [input.userId, input.limit, offset],
      ),
    ]);

    return {
      total: parseInt(countResult.rows[0].count, 10),
      items: listResult.rows.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        condition: row.condition as ItemCondition,
        category: row.category as ItemCategory,
        degradedAt: row.degraded_at,
        createdAt: row.created_at,
        distanceMeters: row.distance_meters,
        locationName: row.location_name ?? null,
        imagePaths: row.image_paths ?? [],
      })),
    };
  }

  async findById(input: FindItemByIdInput): Promise<ItemDetail | null> {
    return this.findDetail('id', input.itemId, input.userId);
  }

  async findBySlug(input: FindItemBySlugInput): Promise<ItemDetail | null> {
    return this.findDetail('slug', input.slug, input.userId);
  }

  private async findDetail(
    column: 'id' | 'slug',
    key: string,
    userId: string | null,
  ): Promise<ItemDetail | null> {
    if (userId === null) {
      const result = await this.db.query<{
        id: string;
        slug: string;
        title: string;
        description: string;
        condition: string;
        category: string;
        weight_range: string;
        status: string;
        requests_paused: boolean;
        degraded_at: Date | null;
        created_at: Date;
        completed_at: Date | null;
        distance_meters: null;
        location_name: string | null;
        image_paths: string[] | null;
        donor_id: null;
        donor_first_name: string;
        donor_last_name: string;
        donor_avatar_url: null;
        donor_reputation_score: number;
      }>(
        `SELECT
           i.id,
           i.slug,
           i.title,
           i.description,
           i.condition,
           i.category,
           i.weight_range,
           i.status,
           i.requests_paused,
           i.degraded_at,
           i.created_at,
           i.completed_at,
           NULL::int AS distance_meters,
           i.location_name,
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
           END AS image_paths,
           NULL       AS donor_id,
           'Anónimo'  AS donor_first_name,
           ''         AS donor_last_name,
           NULL       AS donor_avatar_url,
           COALESCE(u.reputation_score, 0) AS donor_reputation_score
         FROM items i
         LEFT JOIN users u ON u.id = i.donor_id
         WHERE i.${column} = $1`,
        [key],
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        condition: row.condition as ItemCondition,
        category: row.category as ItemDetail['category'],
        weightRange: row.weight_range as ItemDetail['weightRange'],
        status: row.status as ItemStatus,
        requestsPaused: row.requests_paused,
        degradedAt: row.degraded_at,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        distanceMeters: null,
        locationName: row.location_name ?? null,
        imagePaths: row.image_paths ?? [],
        donor: {
          id: null,
          firstName: row.donor_first_name,
          lastName: row.donor_last_name,
          avatarUrl: null,
          reputationScore: row.donor_reputation_score,
        },
      };
    }

    const userLocResult = await this.db.query<{ location: unknown }>(
      'SELECT location FROM users WHERE id = $1',
      [userId],
    );
    if (userLocResult.rows.length === 0 || userLocResult.rows[0].location === null) {
      throw new Error('User location not available');
    }

    const result = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      condition: string;
      category: string;
      weight_range: string;
      status: string;
      requests_paused: boolean;
      degraded_at: Date | null;
      created_at: Date;
      completed_at: Date | null;
      distance_meters: number;
      location_name: string | null;
      image_paths: string[] | null;
      donor_id: string;
      donor_first_name: string;
      donor_last_name: string;
      donor_avatar_url: string | null;
      donor_reputation_score: number;
    }>(
      `SELECT
         i.id,
         i.slug,
         i.title,
         i.description,
         i.condition,
         i.category,
         i.weight_range,
         i.status,
         i.requests_paused,
         i.degraded_at,
         i.created_at,
         i.completed_at,
         ROUND(ST_Distance(
           (SELECT location FROM users WHERE id = $2),
           i.location
         ))::int AS distance_meters,
         i.location_name,
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
         END AS image_paths,
         u.id               AS donor_id,
         u.first_name       AS donor_first_name,
         u.last_name        AS donor_last_name,
         u.avatar_url       AS donor_avatar_url,
         u.reputation_score AS donor_reputation_score
       FROM items i
       JOIN users u ON u.id = i.donor_id
       WHERE i.${column} = $1`,
      [key, userId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      condition: row.condition as ItemCondition,
      category: row.category as ItemDetail['category'],
      weightRange: row.weight_range as ItemDetail['weightRange'],
      status: row.status as ItemStatus,
      requestsPaused: row.requests_paused,
      degradedAt: row.degraded_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      distanceMeters: row.distance_meters,
      locationName: row.location_name ?? null,
      imagePaths: row.image_paths ?? [],
      donor: {
        id: row.donor_id,
        firstName: row.donor_first_name,
        lastName: row.donor_last_name,
        avatarUrl: row.donor_avatar_url,
        reputationScore: row.donor_reputation_score,
      },
    };
  }

  async findForReport(itemId: string): Promise<ItemForReport | null> {
    const result = await this.db.query<{
      id: string;
      donor_id: string;
      title: string;
      status: string;
      category: string;
      description: string;
    }>(
      'SELECT id, donor_id, title, status, category, description FROM items WHERE id = $1',
      [itemId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      donorId: row.donor_id,
      title: row.title,
      status: row.status,
      category: row.category,
      description: row.description,
    };
  }

  async findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null> {
    const result = await this.db.query<{
      id: string;
      donor_id: string;
      status: string;
      requests_paused: boolean;
      title: string;
      category: FindItemOwnershipResult['category'];
      created_at: Date;
    }>(
      'SELECT id, donor_id, status, requests_paused, title, category, created_at FROM items WHERE id = $1',
      [itemId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      donorId: row.donor_id,
      status: row.status,
      requestsPaused: row.requests_paused,
      title: row.title,
      category: row.category,
      createdAt: row.created_at,
    };
  }

  async hasActiveDeliverySession(itemId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM delivery_sessions
         WHERE item_id = $1 AND status = 'active'
       ) AS exists`,
      [itemId],
    );
    return result.rows[0].exists === true;
  }

  async cancelItem(itemId: string): Promise<CancelItemResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const itemResult = await client.query<{ title: string; status: string }>(
        `SELECT title, status FROM items WHERE id = $1 FOR UPDATE`,
        [itemId],
      );
      if (itemResult.rows.length === 0) {
        throw new NotFoundException('Object not found');
      }

      const { title, status } = itemResult.rows[0];
      if (status === 'cancelled') {
        return { receiverId: undefined, itemTitle: title, alreadyCancelled: true };
      }
      if (!['active', 'reserved'].includes(status)) {
        throw new NotFoundException('Object not found');
      }

      const sessionResult = await client.query<{ id: string; receiver_id: string }>(
        `SELECT id, receiver_id
         FROM delivery_sessions
         WHERE item_id = $1 AND status = 'active'
         FOR UPDATE`,
        [itemId],
      );

      let receiverId: string | undefined;

      if (sessionResult.rows.length > 0) {
        const session = sessionResult.rows[0];
        receiverId = session.receiver_id;
        await client.query(
          `UPDATE delivery_sessions SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
          [session.id],
        );
      }

      await client.query(
        `UPDATE items SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
        [itemId],
      );

      await client.query(
        `UPDATE item_requests SET status = 'cancelled'
         WHERE item_id = $1 AND status IN ('pending', 'selected', 'rejected')`,
        [itemId],
      );

      await client.query('COMMIT');
      return { receiverId, itemTitle: title };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async setPauseStatus(itemId: string, paused: boolean): Promise<void> {
    const result = await this.db.query(
      'UPDATE items SET requests_paused = $2 WHERE id = $1',
      [itemId, paused],
    );
    if (result.rowCount === 0) throw new NotFoundException('Object not found');
  }

  async claimPendingDigestItems(): Promise<PendingDigestItem[]> {
    const result = await this.db.query<{
      item_id: string;
      donor_id: string;
      title: string;
      condition: string;
      first_image_path: string | null;
    }>(
      `UPDATE items i
       SET digest_notified_at = NOW()
       WHERE i.status = 'active'
         AND i.digest_notified_at IS NULL
       RETURNING
         i.id AS item_id,
         i.donor_id,
         i.title,
         i.condition,
         (
           SELECT ii.storage_path
           FROM item_images ii
           WHERE ii.item_id = i.id
           ORDER BY ii.created_at ASC
           LIMIT 1
         ) AS first_image_path`,
    );
    return result.rows.map(row => ({
      itemId: row.item_id,
      donorId: row.donor_id,
      title: row.title,
      condition: row.condition as PendingDigestItem['condition'],
      firstImagePath: row.first_image_path,
    }));
  }

  async findEligibleDigestUsersForItem(item: PendingDigestItem): Promise<DigestEligibleUser[]> {
    const result = await this.db.query<{
      user_id: string;
      email: string;
      first_name: string;
      distance_km: number;
      preferred_language: string;
    }>(
      `SELECT
         u.id AS user_id,
         u.email,
         u.first_name,
         u.preferred_language,
         ROUND(ST_Distance(u.location, i.location) / 1000)::int AS distance_km
       FROM users u
       CROSS JOIN items i
       WHERE i.id = $1
         AND u.is_active = TRUE
         AND u.email_verified = TRUE
         AND u.location IS NOT NULL
         AND u.id != i.donor_id
         AND ST_DWithin(u.location, i.location, ${RADIUS_METERS})`,
      [item.itemId],
    );
    return result.rows.map(row => ({
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      distanceKm: row.distance_km,
      preferredLanguage: row.preferred_language as AppPreferredLanguage,
    }));
  }

  async findNewlyDegradedItems(): Promise<NewlyDegradedItem[]> {
    const result = await this.db.query<{
      item_id: string;
      item_title: string;
      category: NewlyDegradedItem['category'];
      created_at: Date;
      donor_id: string;
      donor_email: string;
      donor_first_name: string;
      donor_preferred_language: string;
    }>(
      `SELECT i.id AS item_id, i.title AS item_title,
              i.category, i.created_at,
              i.donor_id, u.email AS donor_email, u.first_name AS donor_first_name,
              u.preferred_language AS donor_preferred_language
       FROM items i
       JOIN users u ON u.id = i.donor_id
       WHERE i.degraded_at IS NOT NULL
         AND i.degraded_at >= NOW() - INTERVAL '75 minutes'
         AND i.status = 'active'`,
    );
    return result.rows.map(row => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      donorId: row.donor_id,
      category: row.category,
      createdAt: row.created_at,
      donorEmail: row.donor_email,
      donorFirstName: row.donor_first_name,
      donorPreferredLanguage: row.donor_preferred_language as AppPreferredLanguage,
    }));
  }

  async adminFindAll(query: AdminItemListQuery): Promise<{ items: AdminItemRecord[]; total: number }> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(i.title ILIKE $${params.length} OR i.description ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`i.category = $${params.length}`);
    }
    if (query.degraded === true) {
      conditions.push('i.degraded_at IS NOT NULL');
    }
    if (query.donorId) {
      params.push(query.donorId);
      conditions.push(`i.donor_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM items i ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (query.page - 1) * query.limit;
    params.push(query.limit, offset);

    const listResult = await this.db.query<{
      id: string;
      title: string;
      description: string;
      condition: string;
      category: string;
      weight_range: string;
      status: string;
      requests_paused: boolean;
      paused_by_admin: boolean;
      degraded_at: Date | null;
      created_at: Date;
      completed_at: Date | null;
      donor_id: string;
      donor_first_name: string;
      donor_last_name: string;
      donor_email: string;
      request_count: number;
      images: string[] | null;
    }>(
      `SELECT
         i.id,
         i.title,
         i.description,
         i.condition,
         i.category,
         i.weight_range,
         i.status,
         i.requests_paused,
         i.paused_by_admin,
         i.degraded_at,
         i.created_at,
         i.completed_at,
         u.id               AS donor_id,
         u.first_name       AS donor_first_name,
         u.last_name        AS donor_last_name,
         u.email            AS donor_email,
         COUNT(DISTINCT ir.id)       AS request_count,
          COALESCE(
            ARRAY_AGG(DISTINCT ii.storage_path) FILTER (WHERE ii.storage_path IS NOT NULL),
            ARRAY[]::text[]
          )                  AS images
        FROM items i
        JOIN users u ON u.id = i.donor_id
        LEFT JOIN item_requests ir ON ir.item_id = i.id
        LEFT JOIN item_images ii ON ii.item_id = i.id
       ${whereClause}
       GROUP BY i.id, u.id
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      total,
      items: listResult.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        condition: row.condition as AdminItemRecord['condition'],
        category: row.category as AdminItemRecord['category'],
        weightRange: row.weight_range as AdminItemRecord['weightRange'],
        status: row.status as AdminItemRecord['status'],
        requestsPaused: row.requests_paused,
        pausedByAdmin: row.paused_by_admin,
        degradedAt: row.degraded_at,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        donorId: row.donor_id,
        donorFirstName: row.donor_first_name,
        donorLastName: row.donor_last_name,
        donorEmail: row.donor_email,
        requestCount: row.request_count,
        images: row.images ?? [],
      })),
    };
  }

  async adminFindById(id: string): Promise<AdminItemDetailRecord | null> {
    const itemResult = await this.db.query<{
      id: string;
      title: string;
      description: string;
      condition: string;
      category: string;
      weight_range: string;
      status: string;
      requests_paused: boolean;
      paused_by_admin: boolean;
      degraded_at: Date | null;
      created_at: Date;
      completed_at: Date | null;
      digest_notified_at: Date | null;
      reserved_at: Date | null;
      donor_id: string;
      donor_first_name: string;
      donor_last_name: string;
      donor_email: string;
      images: string[] | null;
    }>(
      `SELECT
         i.id,
         i.title,
         i.description,
         i.condition,
         i.category,
         i.weight_range,
         i.status,
         i.requests_paused,
         i.paused_by_admin,
         i.degraded_at,
         i.created_at,
         i.completed_at,
         i.digest_notified_at,
         i.reserved_at,
         u.id         AS donor_id,
         u.first_name AS donor_first_name,
         u.last_name  AS donor_last_name,
         u.email      AS donor_email,
         COALESCE(
           ARRAY_AGG(DISTINCT ii.storage_path) FILTER (WHERE ii.storage_path IS NOT NULL),
           ARRAY[]::text[]
         )            AS images
       FROM items i
       JOIN users u ON u.id = i.donor_id
       LEFT JOIN item_images ii ON ii.item_id = i.id
       WHERE i.id = $1
       GROUP BY i.id, u.id`,
      [id],
    );

    if (itemResult.rows.length === 0) return null;

    const item = itemResult.rows[0];

    const requestsResult = await this.db.query<{
      id: string;
      status: string;
      created_at: Date;
      requester_id: string;
      requester_first_name: string;
      requester_last_name: string;
      requester_email: string;
      requester_reputation_score: number;
    }>(
      `SELECT
         ir.id,
         ir.status,
         ir.created_at,
         u.id               AS requester_id,
         u.first_name       AS requester_first_name,
         u.last_name        AS requester_last_name,
         u.email            AS requester_email,
         u.reputation_score AS requester_reputation_score
       FROM item_requests ir
       JOIN users u ON u.id = ir.requester_id
       WHERE ir.item_id = $1
       ORDER BY ir.created_at DESC`,
      [id],
    );

    const sessionResult = await this.db.query<{
      id: string;
      status: string;
      deadline_at: Date | null;
      receiver_id: string;
    }>(
      `SELECT id, status, deadline_at, receiver_id
       FROM delivery_sessions
       WHERE item_id = $1 AND status IN ('active', 'completed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [id],
    );

    const requests: AdminItemRequestRecord[] = requestsResult.rows.map(r => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      requesterId: r.requester_id,
      requesterFirstName: r.requester_first_name,
      requesterLastName: r.requester_last_name,
      requesterEmail: r.requester_email,
      requesterReputationScore: r.requester_reputation_score,
    }));

    const activeSession: AdminItemSessionRecord | null =
      sessionResult.rows.length > 0
        ? {
            id: sessionResult.rows[0].id,
            status: sessionResult.rows[0].status as AdminItemSessionRecord['status'],
            deadlineAt: sessionResult.rows[0].deadline_at,
            receiverId: sessionResult.rows[0].receiver_id,
          }
        : null;

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      condition: item.condition as AdminItemDetailRecord['condition'],
      category: item.category as AdminItemDetailRecord['category'],
      weightRange: item.weight_range as AdminItemDetailRecord['weightRange'],
      status: item.status as AdminItemDetailRecord['status'],
      requestsPaused: item.requests_paused,
      pausedByAdmin: item.paused_by_admin,
      degradedAt: item.degraded_at,
      createdAt: item.created_at,
      completedAt: item.completed_at,
      digestNotifiedAt: item.digest_notified_at,
      reservedAt: item.reserved_at,
      donorId: item.donor_id,
      donorFirstName: item.donor_first_name,
      donorLastName: item.donor_last_name,
      donorEmail: item.donor_email,
      requestCount: requests.length,
      images: item.images ?? [],
      requests,
      activeSession,
    };
  }

  async adminReactivateItem(itemId: string): Promise<void> {
    await this.db.query(
      `UPDATE items
       SET status = 'active',
           requests_paused = FALSE,
           paused_by_admin = FALSE,
           degraded_at = NULL,
           completed_at = NULL,
           reserved_at = NULL
       WHERE id = $1`,
      [itemId],
    );
  }

  async countByStatus(): Promise<{ active: number; reserved: number; completed: number; cancelled: number }> {
    const result = await this.db.query<{
      active: string;
      reserved: string;
      completed: string;
      cancelled: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')    AS active,
         COUNT(*) FILTER (WHERE status = 'reserved')  AS reserved,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
       FROM items`,
    );
    const row = result.rows[0];
    return {
      active: parseInt(row.active, 10),
      reserved: parseInt(row.reserved, 10),
      completed: parseInt(row.completed, 10),
      cancelled: parseInt(row.cancelled, 10),
    };
  }

  async countDegraded(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM items WHERE status = 'active' AND degraded_at IS NOT NULL`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  private mapRow(row: ItemDbRow): Item {
    return {
      id: row.id,
      slug: row.slug,
      donorId: row.donor_id,
      title: row.title,
      description: row.description,
      condition: row.condition as ItemCondition,
      category: row.category as ItemCategory,
      weightRange: row.weight_range as ItemWeightRange,
      status: row.status as ItemStatus,
      requestsPaused: row.requests_paused,
      degradedAt: row.degraded_at,
      createdAt: row.created_at,
      reservedAt: row.reserved_at,
      completedAt: row.completed_at,
    };
  }
}
