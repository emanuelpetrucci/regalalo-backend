/**
 * scripts/backfill-location-names.ts
 *
 * Rellena location_name en users e items existentes que tengan NULL.
 *
 * Estrategia:
 *  1. Users  → forward geocode agrupado por postal_code único (N = # códigos postales distintos)
 *  2. Items  → usa location_name del donante cuando está disponible;
 *              si no, reverse geocode de las coordenadas del item
 *
 * Rate limit: 1 req/s (política de Nominatim pública).
 * Idempotente: solo toca filas con location_name IS NULL.
 *
 * Uso:
 *   npm run backfill:location-names
 *   npm run backfill:location-names:prod   (apunta a producción vía APP_ENV=prod)
 */

import '../src/config/load-env';
import { Pool } from 'pg';

const NOMINATIM_BASE_URL =
  process.env['NOMINATIM_BASE_URL'] ?? 'https://nominatim.openstreetmap.org';

const DELAY_MS = 1100; // >1 s entre peticiones (Nominatim ToS)

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Regalalo/1.0 backfill-location-names' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}: ${url}`);
  return res.json();
}

function extractLocationName(address?: NominatimAddress, displayName?: string): string | null {
  if (address) {
    const name =
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.county;
    if (name) return name;
  }
  if (displayName) {
    const parts = displayName.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) return trimmed;
    }
  }
  return null;
}

async function forwardGeocode(postalCode: string, country = 'es'): Promise<string | null> {
  const searchWithCountry = async (c?: string): Promise<string | null> => {
    const params = new URLSearchParams({
      postalcode: postalCode,
      format: 'json',
      limit: '1',
      addressdetails: '1',
      ...(c ? { country: c } : {}),
    });
    const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;
    const data = await nominatimFetch(url) as Array<{ display_name: string; address?: NominatimAddress }>;
    if (!Array.isArray(data) || !data.length) return null;
    return extractLocationName(data[0].address, data[0].display_name);
  };

  const result = await searchWithCountry(country);
  if (result) return result;

  // Fallback: búsqueda global sin filtro de país
  await sleep(DELAY_MS);
  return searchWithCountry();
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    zoom: '10',
    addressdetails: '1',
  });
  const url = `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`;
  const data = await nominatimFetch(url) as { display_name?: string; address?: NominatimAddress } | null;
  if (!data) return null;
  return extractLocationName(
    (data as { address?: NominatimAddress }).address,
    (data as { display_name?: string }).display_name,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL no definido');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // ── 1. USUARIOS ────────────────────────────────────────────────────────────
    console.log('\n=== BACKFILL USERS ===');

    const distinctPostalCodes = await pool.query<{ postal_code: string; user_count: number }>(
      `SELECT postal_code, COUNT(*) AS user_count
       FROM users
       WHERE location_name IS NULL
       GROUP BY postal_code
       ORDER BY user_count DESC`,
    );

    console.log(`Códigos postales únicos con location_name NULL: ${distinctPostalCodes.rows.length}`);

    let usersUpdated = 0;
    let userApiCalls = 0;

    for (const { postal_code, user_count } of distinctPostalCodes.rows) {
      await sleep(DELAY_MS);
      userApiCalls++;

      let locationName: string | null = null;
      try {
        locationName = await forwardGeocode(postal_code);
      } catch (err) {
        console.warn(`  WARN postal_code=${postal_code}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!locationName) {
        console.log(`  SKIP postal_code=${postal_code} — sin resultado de Nominatim`);
        continue;
      }

      const result = await pool.query(
        `UPDATE users SET location_name = $1 WHERE postal_code = $2 AND location_name IS NULL`,
        [locationName, postal_code],
      );
      const updated = result.rowCount ?? 0;
      usersUpdated += updated;
      console.log(`  ${postal_code} → "${locationName}" (${updated}/${user_count} usuarios)`);
    }

    console.log(`\nUsuarios actualizados: ${usersUpdated} | Llamadas API: ${userApiCalls}`);

    // ── 2. ITEMS ───────────────────────────────────────────────────────────────
    console.log('\n=== BACKFILL ITEMS ===');

    // Primero actualizar items cuyo donante ya tiene location_name (sin API call)
    const itemsFromDonor = await pool.query(
      `UPDATE items i
       SET location_name = u.location_name
       FROM users u
       WHERE i.donor_id = u.id
         AND i.location_name IS NULL
         AND u.location_name IS NOT NULL`,
    );
    console.log(`Items actualizados desde donante: ${itemsFromDonor.rowCount ?? 0}`);

    // Items restantes con location_name NULL → reverse geocode
    const remainingItems = await pool.query<{
      id: string;
      lat: number;
      lon: number;
    }>(
      `SELECT id,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lon
       FROM items
       WHERE location_name IS NULL`,
    );

    console.log(`Items restantes (reverse geocode necesario): ${remainingItems.rows.length}`);

    let itemsUpdated = 0;
    let itemApiCalls = 0;

    for (const item of remainingItems.rows) {
      await sleep(DELAY_MS);
      itemApiCalls++;

      let locationName: string | null = null;
      try {
        locationName = await reverseGeocode(item.lat, item.lon);
      } catch (err) {
        console.warn(`  WARN item=${item.id}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!locationName) {
        console.log(`  SKIP item=${item.id} — sin resultado de Nominatim`);
        continue;
      }

      await pool.query(
        `UPDATE items SET location_name = $1 WHERE id = $2 AND location_name IS NULL`,
        [locationName, item.id],
      );
      itemsUpdated++;
      console.log(`  item=${item.id} → "${locationName}"`);
    }

    console.log(`\nItems actualizados (reverse geocode): ${itemsUpdated} | Llamadas API: ${itemApiCalls}`);

    // ── Resumen ────────────────────────────────────────────────────────────────
    const nullUsers = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM users WHERE location_name IS NULL',
    );
    const nullItems = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM items WHERE location_name IS NULL',
    );

    console.log('\n=== RESUMEN FINAL ===');
    console.log(`Users con location_name NULL restantes: ${nullUsers.rows[0].count}`);
    console.log(`Items con location_name NULL restantes:  ${nullItems.rows[0].count}`);
    console.log('Backfill completado.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
