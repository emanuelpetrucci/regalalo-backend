import rateLimit from 'express-rate-limit';

export function createAdminAuthRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test',
  });
}

export function createAdminApiRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test',
  });
}
