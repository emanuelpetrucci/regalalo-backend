import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { isE2eApiAvailable } from './e2e-guard';

function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function e2eAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isE2eApiAvailable()) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const header = req.headers['x-e2e-secret'];
  const provided =
    typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;

  if (!provided || !secretsMatch(provided, env.E2E_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
