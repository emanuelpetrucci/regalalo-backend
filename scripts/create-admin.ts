import '../src/config/load-env';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('ERROR: falta DATABASE_URL');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  const email = await rl.question('Email: ');
  const password = await rl.question('Contraseña: ');
  rl.close();

  if (!email || !password) {
    console.error('ERROR: email y contraseña son obligatorios');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('ERROR: la contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  const existing = await pool.query(
    'SELECT id FROM admin_users WHERE LOWER(email) = LOWER($1)',
    [email],
  );

  if (existing.rows.length > 0) {
    console.error(`ERROR: ya existe un admin con el email "${email}"`);
    await pool.end();
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);

  const { rows } = await pool.query<{ id: string; email: string }>(
    'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email.toLowerCase(), passwordHash],
  );

  await pool.end();

  console.log(`\nAdmin creado: ${rows[0].email} (id: ${rows[0].id})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
