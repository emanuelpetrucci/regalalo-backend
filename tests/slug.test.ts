import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { allocateSlug, slugBase } from '../src/domain/slug';
import { PostgresItemRepository } from '../src/infrastructure/database/supabase/item.repository';
import { CreateItemInput } from '../src/domain/repositories/item.repository';

describe('slugBase', () => {
  it('Bicicleta Montaña → bicicleta-montana', () => {
    expect(slugBase('Bicicleta Montaña')).toBe('bicicleta-montana');
    expect(slugBase('  Bicicleta   Montaña!! ')).toBe('bicicleta-montana');
  });

  it('colapsa guiones y recorta los extremos', () => {
    expect(slugBase('Hola---Mundo!!!')).toBe('hola-mundo');
    expect(slugBase('---hola---')).toBe('hola');
    expect(slugBase('Ñandú')).toBe('nandu');
    expect(slugBase('Ça va')).toBe('ca-va');
  });

  it('recorta a 60 sin dejar un guion al final', () => {
    expect(slugBase('a'.repeat(80))).toBe('a'.repeat(60));
    expect(slugBase(`${'a'.repeat(59)} ${'b'.repeat(20)}`)).toBe('a'.repeat(59));
  });

  it('título sin caracteres útiles → item', () => {
    expect(slugBase('!!!')).toBe('item');
    expect(slugBase('🚲🚲')).toBe('item');
    expect(slugBase('   ')).toBe('item');
  });

  it('quita marcas combinantes fuera del bloque básico', () => {
    expect(slugBase('a\u20D0b')).toBe('ab');
    expect(slugBase('e\u1DC4')).toBe('e');
  });

  it('un título que es un UUID v4 no deja esa cadena como slug', () => {
    expect(slugBase('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'item-550e8400-e29b-41d4-a716-446655440000',
    );
  });
});

describe('allocateSlug', () => {
  it('el primero conserva la base y el siguiente suma el sufijo', () => {
    expect(allocateSlug('bicicleta-montana', [])).toBe('bicicleta-montana');
    expect(allocateSlug('bicicleta-montana', ['bicicleta-montana'])).toBe('bicicleta-montana-2');
    expect(allocateSlug('bicicleta-montana', ['bicicleta-montana', 'bicicleta-montana-2'])).toBe(
      'bicicleta-montana-3',
    );
    expect(allocateSlug('item', ['item'])).toBe('item-2');
  });
});

describe('PostgresItemRepository.createWithImages slug collision', () => {
  const input: CreateItemInput = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    donorId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Bicicleta Montaña',
    description: 'Rodado 26',
    condition: 'good',
    category: 'sports',
    weightRange: 'gt20',
    lat: 40.4,
    lng: -3.7,
    locationName: 'Madrid',
    imagePaths: ['items/x/a.jpg'],
  };

  function slugViolation(slug: string): Error & { code: string; constraint: string; detail: string } {
    const err = new Error('duplicate key value violates unique constraint "idx_items_slug"') as Error & {
      code: string;
      constraint: string;
      detail: string;
    };
    err.code = '23505';
    err.constraint = 'idx_items_slug';
    err.detail = `Key (slug)=(${slug}) already exists.`;
    return err;
  }

  function fakeDb(options: {
    failFirstBase?: boolean;
    alreadyTaken?: string[];
    alwaysSlugConflict?: boolean;
    primaryKeyConflict?: boolean;
  }) {
    const taken = [...(options.alreadyTaken ?? [])];
    const failFirstBase = options.failFirstBase ?? false;
    let failedBase = false;
    const inserts: string[] = [];
    const images: string[] = [];
    const statements: string[] = [];

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        const text = sql.replace(/\s+/g, ' ').trim();
        statements.push(text);
        if (
          text === 'BEGIN' ||
          text === 'COMMIT' ||
          text === 'ROLLBACK' ||
          text.startsWith('SAVEPOINT') ||
          text.startsWith('RELEASE SAVEPOINT') ||
          text.startsWith('ROLLBACK TO SAVEPOINT')
        ) {
          return { rows: [] };
        }
        if (text.startsWith('SELECT slug')) {
          return { rows: taken.map((slug) => ({ slug })) };
        }
        if (text.startsWith('INSERT INTO items')) {
          const slug = String(params[10]);
          inserts.push(slug);
          if (options.primaryKeyConflict) {
            const err = new Error('duplicate key value violates unique constraint "items_pkey"') as Error & {
              code: string;
              constraint: string;
              detail: string;
            };
            err.code = '23505';
            err.constraint = 'items_pkey';
            err.detail = `Key (id)=(${input.id}) already exists.`;
            throw err;
          }
          if (options.alwaysSlugConflict) throw slugViolation(slug);
          if (failFirstBase && !failedBase && slug === 'bicicleta-montana') {
            failedBase = true;
            taken.push(slug);
            throw slugViolation(slug);
          }
          return {
            rows: [{
              id: input.id,
              slug,
              donor_id: input.donorId,
              title: input.title,
              description: input.description,
              condition: input.condition,
              category: input.category,
              weight_range: input.weightRange,
              status: 'active',
              requests_paused: false,
              degraded_at: null,
              created_at: new Date('2026-10-26T00:00:00Z'),
              reserved_at: null,
              completed_at: null,
            }],
          };
        }
        if (text.startsWith('INSERT INTO item_images')) {
          images.push(String(params[1]));
          return { rows: [] };
        }
        throw new Error(`SQL inesperado: ${text}`);
      },
      release: () => undefined,
    };

    const db = {
      connect: async () => client,
    } as unknown as Pool;

    return { db, inserts, images, statements };
  }

  it('reintenta dentro de la transacción si el índice único choca', async () => {
    const { db, inserts, images, statements } = fakeDb({ failFirstBase: true });
    const item = await new PostgresItemRepository(db).createWithImages(input);

    expect(inserts).toEqual(['bicicleta-montana', 'bicicleta-montana-2']);
    expect(item.slug).toBe('bicicleta-montana-2');
    expect(images).toEqual(['items/x/a.jpg']);
    expect(statements.some((sql) => sql.startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true);
    expect(statements.some((sql) => sql === 'COMMIT')).toBe(true);
    expect(statements.some((sql) => sql === 'ROLLBACK')).toBe(false);
  });

  it('si la base ya existe, el alta queda en base-2 sin error', async () => {
    const { db, inserts } = fakeDb({ alreadyTaken: ['bicicleta-montana'] });
    const item = await new PostgresItemRepository(db).createWithImages(input);

    expect(inserts).toEqual(['bicicleta-montana-2']);
    expect(item.slug).toBe('bicicleta-montana-2');
  });

  it('agota los 8 reintentos y relanza el 23505 del slug', async () => {
    const { db, inserts, statements } = fakeDb({ alwaysSlugConflict: true });

    await expect(new PostgresItemRepository(db).createWithImages(input)).rejects.toMatchObject({
      code: '23505',
      constraint: 'idx_items_slug',
    });
    expect(inserts).toHaveLength(8);
    expect(statements.filter((sql) => sql.startsWith('INSERT INTO items'))).toHaveLength(8);
    expect(statements.some((sql) => sql === 'COMMIT')).toBe(false);
  });

  it('un 23505 de otra constraint no se reintenta', async () => {
    const { db, inserts } = fakeDb({ primaryKeyConflict: true });

    await expect(new PostgresItemRepository(db).createWithImages(input)).rejects.toMatchObject({
      code: '23505',
      constraint: 'items_pkey',
    });
    expect(inserts).toEqual(['bicicleta-montana']);
  });
});
