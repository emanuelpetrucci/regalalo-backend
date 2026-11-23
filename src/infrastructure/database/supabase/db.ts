import { Pool } from 'pg';
import { env } from '../../../config/env';
import { logger } from '../../logging/logger';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

db.on('error', (err) => {
  logger.fatal(err, 'pg pool error');
});
