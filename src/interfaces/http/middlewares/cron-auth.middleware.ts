import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';

function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function cronAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-cron-secret'];
  const provided = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;

  if (!provided || !secretsMatch(provided, env.CRON_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
