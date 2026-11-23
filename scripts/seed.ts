import '../src/config/load-env';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { createClient } from '@supabase/supabase-js';
import { allocateSlug, slugBase } from '../src/domain/slug';

const TEST_PASSWORD = 'Test1234!';
const IMAGES_PER_ITEM = 2;

// 1×1 GIF transparente — imagen de prueba válida (35 bytes, sin dependencias externas)
const PLACEHOLDER_IMAGE = Buffer.from(
  'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  'base64',
);
const PLACEHOLDER_MIME = 'image/gif';
const PLACEHOLDER_EXT = 'gif';

const TEST_USERS = [
  { firstName: 'Lucas',     lastName: 'Martínez',  email: 'lucas.martinez@test.com',      postalCode: '1001', lng: -58.3816, lat: -34.6037 }, // Buenos Aires Centro
  { firstName: 'Sofía',     lastName: 'González',  email: 'sofia.gonzalez@test.com',      postalCode: '1425', lng: -58.4200, lat: -34.5749 }, // Palermo
  { firstName: 'Mateo',     lastName: 'López',     email: 'mateo.lopez@test.com',         postalCode: '1070', lng: -58.3747, lat: -34.6205 }, // San Telmo
  { firstName: 'Valentina', lastName: 'Rodríguez', email: 'valentina.rodriguez@test.com', postalCode: '1426', lng: -58.4571, lat: -34.5614 }, // Belgrano
  { firstName: 'Joaquín',   lastName: 'Fernández', email: 'joaquin.fernandez@test.com',   postalCode: '1002', lng: -58.3712, lat: -34.6083 }, // Monserrat
  { firstName: 'Camila',    lastName: 'Sánchez',   email: 'camila.sanchez@test.com',      postalCode: '1414', lng: -58.3960, lat: -34.5985 }, // Villa Crespo
  { firstName: 'Nicolás',   lastName: 'Gómez',     email: 'nicolas.gomez@test.com',       postalCode: '1406', lng: -58.4307, lat: -34.6258 }, // Caballito
  { firstName: 'Lucía',     lastName: 'Díaz',      email: 'lucia.diaz@test.com',          postalCode: '1430', lng: -58.4333, lat: -34.5833 }, // Colegiales
  { firstName: 'Tomás',     lastName: 'Pérez',     email: 'tomas.perez@test.com',         postalCode: '1437', lng: -58.3944, lat: -34.6358 }, // Parque Patricios
  { firstName: 'Martina',   lastName: 'Torres',    email: 'martina.torres@test.com',      postalCode: '1271', lng: -58.3876, lat: -34.6474 }, // Barracas
];

type Condition   = 'new' | 'like_new' | 'good' | 'fair';
type Category    = 'furniture' | 'electronics' | 'clothing' | 'books' | 'toys' | 'kitchen' | 'sports' | 'tools' | 'other';
type WeightRange = 'lt1' | '1to5' | '5to20' | 'gt20';

interface ItemTemplate {
  title: string;
  description: string;
  condition: Condition;
  category: Category;
  weightRange: WeightRange;
}

// 20 templates — se rotan 6 por usuario → todos reciben ítems distintos
const ITEM_TEMPLATES: ItemTemplate[] = [
  { title: 'Silla de oficina ergonómica',    description: 'Silla con soporte lumbar y ruedas en perfecto estado. Ideal para home office.',   condition: 'like_new', category: 'furniture',   weightRange: '5to20' },
  { title: 'Heladera bajo mesada 60L',       description: 'Mini heladera funcional, ideal para habitación o estudio.',                        condition: 'good',     category: 'kitchen',     weightRange: 'gt20'  },
  { title: 'El Aleph — Jorge Luis Borges',   description: 'Edición 2010, Debolsillo. Sin marcas ni subrayados.',                             condition: 'good',     category: 'books',       weightRange: 'lt1'   },
  { title: 'Campera puffer talle M',         description: 'Campera de abrigo color negro, poco uso.',                                        condition: 'like_new', category: 'clothing',    weightRange: '1to5'  },
  { title: 'Consola retro con 500 juegos',   description: 'Consola tipo NES mini, incluye dos controles y todos los cables.',                 condition: 'good',     category: 'electronics', weightRange: '1to5'  },
  { title: 'Juego de cacerolas acero inox',  description: 'Set de 4 piezas, algunos raspones menores pero sin abolladuras.',                  condition: 'fair',     category: 'kitchen',     weightRange: '5to20' },
  { title: 'Bicicleta de paseo rodado 26',   description: 'Frenos en buen estado. Solo necesita ajuste de cambios.',                          condition: 'good',     category: 'sports',      weightRange: 'gt20'  },
  { title: 'Tablet Android 10 pulgadas',     description: 'Samsung 32 GB, pantalla sin rayaduras, batería de 6 horas.',                      condition: 'like_new', category: 'electronics', weightRange: 'lt1'   },
  { title: 'Mesa ratona madera clara',       description: 'Mesa 90x60 cm de pino. Pequeña rayadura en una esquina.',                         condition: 'good',     category: 'furniture',   weightRange: 'gt20'  },
  { title: 'Caja de herramientas completa',  description: 'Martillo, destornilladores, alicates, cinta métrica y llave inglesa.',             condition: 'good',     category: 'tools',       weightRange: '5to20' },
  { title: 'Zapatillas running talle 42',    description: 'Asics color gris, usadas 3 meses. Suela con buen grip.',                          condition: 'like_new', category: 'clothing',    weightRange: 'lt1'   },
  { title: 'Lego City 500 piezas',           description: 'Set completo con instrucciones. Todas las piezas presentes.',                      condition: 'good',     category: 'toys',        weightRange: '1to5'  },
  { title: 'Impresora laser monocromática',  description: 'HP LaserJet, funciona bien. Tóner al 40%. Cable incluido.',                       condition: 'good',     category: 'electronics', weightRange: '5to20' },
  { title: 'Sillón de lectura cuero',        description: 'Color marrón, muy cómodo. Desgaste leve en los apoyabrazos.',                     condition: 'fair',     category: 'furniture',   weightRange: 'gt20'  },
  { title: 'Raquetas de tenis x2',           description: 'Par de raquetas Head con funda. Cuerdas en buen estado.',                         condition: 'good',     category: 'sports',      weightRange: '1to5'  },
  { title: 'Enciclopedia Larousse 12 tomos', description: 'Colección completa, tapa dura, excelente estado.',                                condition: 'new',      category: 'books',       weightRange: '5to20' },
  { title: 'Taladro eléctrico 500W',         description: 'Black & Decker con set de 10 brocas incluidas.',                                  condition: 'good',     category: 'tools',       weightRange: '1to5'  },
  { title: 'Muñeca con accesorios',          description: 'Barbie con ropa, casa y auto. Todo en buen estado.',                              condition: 'good',     category: 'toys',        weightRange: 'lt1'   },
  { title: 'Pantalones de invierno x3',      description: 'Talle 38, colores negro, gris y azul. Buen estado.',                              condition: 'good',     category: 'clothing',    weightRange: '1to5'  },
  { title: 'Calefactor a gas 3000 kcal',     description: 'Cefas, sin llama. Requiere instalación por gasista matriculado.',                 condition: 'fair',     category: 'other',       weightRange: 'gt20'  },
];

const ITEMS_PER_USER = 6;

function getItemsForUser(userIndex: number): ItemTemplate[] {
  const start = (userIndex * ITEMS_PER_USER) % ITEM_TEMPLATES.length;
  return Array.from({ length: ITEMS_PER_USER }, (_, i) =>
    ITEM_TEMPLATES[(start + i) % ITEM_TEMPLATES.length],
  );
}

type StorageUploader = (storagePath: string) => Promise<void>;

function createUploader(): StorageUploader {
  const driver = process.env['STORAGE_DRIVER'] ?? 'supabase';

  if (driver === 'local') {
    const baseDir = path.resolve(process.env['LOCAL_STORAGE_DIR'] ?? '.storage');
    return async (storagePath: string) => {
      const fullPath = path.join(baseDir, storagePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, PLACEHOLDER_IMAGE);
    };
  }

  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const bucket = process.env['SUPABASE_STORAGE_BUCKET'];
  if (!supabaseUrl || !supabaseKey || !bucket) {
    throw new Error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_STORAGE_BUCKET');
  }

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

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('ERROR: falta DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const uploadImage = createUploader();

  console.log('Computando hash de contraseña...');
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  console.log('Limpiando base de datos...\n');
  await pool.query('TRUNCATE TABLE analytics_events, storage_deletion_queue, users CASCADE;');
  const takenSlugs = new Set<string>();

  for (let i = 0; i < TEST_USERS.length; i++) {
    const u = TEST_USERS[i];

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (
        email, password_hash, postal_code, location,
        first_name, last_name,
        email_verified, is_active, preferred_language
      ) VALUES (
        $1, $2, $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
        $6, $7, TRUE, TRUE, 'es'
      ) RETURNING id`,
      [u.email, passwordHash, u.postalCode, u.lng, u.lat, u.firstName, u.lastName],
    );
    const userId = rows[0].id;

    const items = getItemsForUser(i);
    let totalImages = 0;

    for (const item of items) {
      const itemLng = u.lng + (Math.random() - 0.5) * 0.02;
      const itemLat = u.lat + (Math.random() - 0.5) * 0.02;

      const slug = allocateSlug(slugBase(item.title), takenSlugs);
      takenSlugs.add(slug);

      const { rows: itemRows } = await pool.query<{ id: string }>(
        `INSERT INTO items (
          donor_id, title, description, condition, location, category, weight_range, slug
        ) VALUES (
          $1, $2, $3, $4,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
          $7, $8, $9
        ) RETURNING id`,
        [userId, item.title, item.description, item.condition, itemLng, itemLat, item.category, item.weightRange, slug],
      );
      const itemId = itemRows[0].id;

      for (let k = 0; k < IMAGES_PER_ITEM; k++) {
        const storagePath = `items/${itemId}/${randomUUID()}.${PLACEHOLDER_EXT}`;
        await uploadImage(storagePath);
        await pool.query(
          'INSERT INTO item_images (item_id, storage_path) VALUES ($1, $2)',
          [itemId, storagePath],
        );
        totalImages++;
      }
    }

    console.log(
      `[${String(i + 1).padStart(2, '0')}/${TEST_USERS.length}] ${u.firstName} ${u.lastName} <${u.email}> — ${items.length} ítems, ${totalImages} imágenes`,
    );
  }

  await pool.end();

  const totalItems = TEST_USERS.length * ITEMS_PER_USER;
  const totalImages = totalItems * IMAGES_PER_ITEM;
  console.log(`\nSeed completo: ${TEST_USERS.length} usuarios, ${totalItems} ítems, ${totalImages} imágenes.`);
  console.log(`Contraseña para todos los usuarios: "${TEST_PASSWORD}"`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
