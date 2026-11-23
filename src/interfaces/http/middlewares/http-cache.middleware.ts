import { Request, Response, NextFunction } from 'express';

/**
 * Política HTTP de caché por prefijo de ruta (SEC complementario a NFR7).
 * APIs JSON con PII/JWT: no-store. Health: no-cache. Storage estático: public 24h.
 */
export function httpCacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  if (path.startsWith('/api/storage')) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else if (path === '/api/health') {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
}
