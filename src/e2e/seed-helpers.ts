import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Pool } from 'pg';
import * as argon2 from 'argon2';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { slugBase } from '../domain/slug';

export const E2E_GEO = {
  postalCode: '1001',
  lng: -58.3816,
  lat: -34.6037,
} as const;

const PLACEHOLDER_IMAGE = Buffer.from(
  'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  'base64',
);
const PLACEHOLDER_MIME = 'image/gif';
const PLACEHOLDER_EXT = 'gif';

export type E2eUserRole =
  | 'donor'
  | 'receiver'
  | 'r1'
  | 'r2'
  | 'r3';

export interface SeededUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  jwtVersion: number;
  reputationScore: number;
}

export interface SeededItem {
  id: string;
  title: string;
}

export type StorageUploader = (storagePath: string) => Promise<void>;

export function createStorageUploader(): StorageUploader {
  if (env.STORAGE_DRIVER === 'local') {
    const baseDir = path.resolve(env.LOCAL_STORAGE_DIR);
    return async (storagePath: string) => {
      const fullPath = path.join(baseDir, storagePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, PLACEHOLDER_IMAGE);
    };
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return async (storagePath: string) => {
    const { error } = await client.storage
      .from(bucket)
      .upload(storagePath, PLACEHOLDER_IMAGE, { contentType: PLACEHOLDER_MIME, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  };
}

type SeedUserInput = {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  reputationScore?: number;
  totalDonated?: number;
  totalReceived?: number;
  consecutiveNoShows?: number;
  cyclesAtLimit?: number;
  lastActiveAt?: Date | null;
};

function resolveLastActiveAt(lastActiveAt: Date | null | undefined): Date | null {
  if (lastActiveAt === undefined) {
    return new Date();
  }
  return lastActiveAt;
}

async function insertUser(
  pool: Pool,
  input: SeedUserInput,
  emailVerified: boolean,
): Promise<SeededUser> {
  const password = input.password ?? env.E2E_DEFAULT_PASSWORD;
  const passwordHash = await argon2.hash(password);
  const lastActiveAt = resolveLastActiveAt(input.lastActiveAt);

  const { rows } = await pool.query<{
    id: string;
    jwt_version: number;
    reputation_score: number;
  }>(
    `INSERT INTO users (
       email, password_hash, postal_code, location, jwt_version,
       first_name, last_name, email_verified, is_active, preferred_language,
       reputation_score, total_donated, total_received, consecutive_no_shows,
       cycles_at_limit, last_active_at
     ) VALUES (
       $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, 1,
       $6, $7, $8, TRUE, 'es', $9, $10, $11, $12, $13, $14
     )
     RETURNING id, jwt_version, reputation_score`,
    [
      input.email,
      passwordHash,
      E2E_GEO.postalCode,
      E2E_GEO.lng,
      E2E_GEO.lat,
      input.firstName,
      input.lastName,
      emailVerified,
      input.reputationScore ?? 10,
      input.totalDonated ?? 0,
      input.totalReceived ?? 0,
      input.consecutiveNoShows ?? 0,
      input.cyclesAtLimit ?? 0,
      lastActiveAt,
    ],
  );

  const row = rows[0];
  return {
    id: row.id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    password,
    jwtVersion: row.jwt_version,
    reputationScore: row.reputation_score,
  };
}

export async function seedVerifiedUser(
  pool: Pool,
  input: SeedUserInput,
): Promise<SeededUser> {
  return insertUser(pool, input, true);
}

export async function seedUnverifiedUser(
  pool: Pool,
  input: SeedUserInput,
): Promise<SeededUser> {
  return insertUser(pool, input, false);
}

export async function seedActiveItem(
  pool: Pool,
  upload: StorageUploader,
  input: {
    donorId: string;
    title?: string;
    description?: string;
    imageCount?: number;
  },
): Promise<SeededItem> {
  const itemId = randomUUID();
  const title = input.title ?? 'Objeto E2E de prueba';
  const description = input.description ?? 'Descripción de prueba para escenarios E2E';
  const imageCount = input.imageCount ?? 2;

  const slug = `${slugBase(title)}-${itemId.replace(/-/g, '').slice(0, 12)}`;

  await pool.query(
    `INSERT INTO items (
       id, donor_id, title, description, condition, category, weight_range, location, status, slug
     ) VALUES (
       $1, $2, $3, $4, 'good', 'furniture', '1to5',
       ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, 'active', $7
     )`,
    [itemId, input.donorId, title, description, E2E_GEO.lng, E2E_GEO.lat, slug],
  );

  for (let i = 0; i < imageCount; i++) {
    const storagePath = `items/${itemId}/${randomUUID()}.${PLACEHOLDER_EXT}`;
    await upload(storagePath);
    await pool.query('INSERT INTO item_images (item_id, storage_path) VALUES ($1, $2)', [
      itemId,
      storagePath,
    ]);
  }

  return { id: itemId, title };
}

export async function seedPausedItem(pool: Pool, itemId: string): Promise<void> {
  await pool.query('UPDATE items SET requests_paused = TRUE WHERE id = $1', [itemId]);
}

export async function seedThreePendingRequestsForUser(
  pool: Pool,
  receiverId: string,
  donorIds: string[],
): Promise<{ itemIds: string[] }> {
  if (donorIds.length !== 3) {
    throw new Error('seedThreePendingRequestsForUser requires exactly 3 donor IDs');
  }

  const upload = createStorageUploader();
  const itemIds: string[] = [];
  for (let i = 0; i < donorIds.length; i++) {
    const item = await seedActiveItem(pool, upload, {
      donorId: donorIds[i],
      title: `Objeto límite E2E ${i + 1}`,
    });
    itemIds.push(item.id);
    await seedItemRequest(pool, {
      itemId: item.id,
      requesterId: receiverId,
      contactChannel: `whatsapp:+549110000000${i}`,
    });
  }

  return { itemIds };
}

export async function seedItemRequest(
  pool: Pool,
  input: { itemId: string; requesterId: string; contactChannel?: string },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO item_requests (item_id, requester_id, contact_channel)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.itemId, input.requesterId, input.contactChannel ?? 'whatsapp:+5491100000000'],
  );
  return rows[0].id;
}

export async function seedDeliveryActive(
  pool: Pool,
  input: {
    itemId: string;
    donorId: string;
    receiverId: string;
    requestId: string;
    contactChannel?: string;
    receiverContactChannel?: string;
  },
): Promise<string> {
  const requestChannelResult = await pool.query<{ contact_channel: string | null }>(
    'SELECT contact_channel FROM item_requests WHERE id = $1',
    [input.requestId],
  );
  const requestContactChannel = requestChannelResult.rows[0]?.contact_channel ?? null;
  const receiverContactChannel =
    input.receiverContactChannel ?? requestContactChannel ?? 'whatsapp:+5491100000000';

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO delivery_sessions (
       item_id, donor_id, receiver_id, contact_channel, receiver_contact_channel
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.itemId,
      input.donorId,
      input.receiverId,
      input.contactChannel ?? 'whatsapp:+5491199999999',
      receiverContactChannel,
    ],
  );
  const sessionId = rows[0].id;

  await pool.query(
    `UPDATE item_requests SET status = 'selected', contact_channel = NULL WHERE id = $1`,
    [input.requestId],
  );
  await pool.query(
    `UPDATE item_requests SET status = 'rejected', contact_channel = NULL
     WHERE item_id = $1 AND id != $2 AND status = 'pending'`,
    [input.itemId, input.requestId],
  );
  await pool.query(
    `UPDATE items SET status = 'reserved', reserved_at = NOW() WHERE id = $1`,
    [input.itemId],
  );

  return sessionId;
}

export async function seedDeliveryCompleted(
  pool: Pool,
  input: {
    itemId: string;
    donorId: string;
    receiverId: string;
    contactChannel?: string;
  },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO delivery_sessions (
       item_id, donor_id, receiver_id, contact_channel, status,
       donor_confirmed, completed_at
     ) VALUES ($1, $2, $3, $4, 'completed', TRUE, NOW())
     RETURNING id`,
    [
      input.itemId,
      input.donorId,
      input.receiverId,
      input.contactChannel ?? 'whatsapp:+5491199999999',
    ],
  );

  await pool.query(
    `UPDATE items SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [input.itemId],
  );

  return rows[0].id;
}
