import rateLimit from 'express-rate-limit';

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    process.env['NODE_ENV'] === 'development' ||
    process.env['NODE_ENV'] === 'test' ||
    req.path === '/api/health' ||
    req.originalUrl.includes('/api/health') ||
    req.path.startsWith('/api/jobs') ||
    req.originalUrl.includes('/api/jobs'),
});

export function createJobsRateLimit() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test',
});

export function createPublicItemsRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () =>
      process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test',
  });
}

export function createCandidatesRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
