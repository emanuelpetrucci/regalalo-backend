import express, { Router } from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { createCorsOptions } from './config/cors';
import { env } from './config/env';
import { appLogger } from './config/loggers';
import { globalRateLimit, authRateLimit } from './interfaces/http/middlewares/rate-limit';
import { createAdminAuthRateLimit, createAdminApiRateLimit } from './interfaces/http/middlewares/admin-rate-limit';
import { httpCacheMiddleware } from './interfaces/http/middlewares/http-cache.middleware';
import { errorHandler } from './interfaces/http/middlewares/error-handler';
import { router } from './interfaces/http/routes/index';
import { createOpenApiRouter } from './interfaces/http/routes/openapi.routes';

const app = express();
const exposeOpenApi = env.NODE_ENV !== 'production';

app.set('trust proxy', 1);

app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'https://*.supabase.co', 'data:'],
      'connect-src': ["'self'", 'https://*.supabase.co'],
    },
  },
}));

const adminDevOrigins = env.NODE_ENV !== 'production' ? ['http://localhost:4201'] : [];

app.use(
  cors(
    createCorsOptions({
      primaryOrigin: env.CORS_ORIGIN,
      extraOrigins: env.CORS_EXTRA_ORIGINS,
      allowVercelPreviews: env.CORS_ALLOW_VERCEL_PREVIEWS,
    }),
  ),
);

app.use(
  '/api/admin',
  cors(
    createCorsOptions({
      primaryOrigin: env.ADMIN_CORS_ORIGIN,
      extraOrigins: adminDevOrigins,
      allowVercelPreviews: false,
    }),
  ),
);

app.use(pinoHttp({
  logger: appLogger,
  autoLogging: { ignore: (req) => req.url === '/api/health' },
}));

app.use(express.json());

app.use(globalRateLimit);
app.use(httpCacheMiddleware);
app.use('/api/auth', authRateLimit);
app.use('/api/admin/auth', createAdminAuthRateLimit());
app.use('/api/admin', createAdminApiRateLimit());

if (exposeOpenApi) {
  app.use('/api', createOpenApiRouter());
  const apiDocsRedirect = Router();
  apiDocsRedirect.get('/', (_req, res) => {
    res.redirect(302, '/api/docs');
  });
  app.use('/api-docs', apiDocsRedirect);
}

app.use('/api', router);

if (env.STORAGE_DRIVER === 'local') {
  app.use('/api/storage', express.static(path.resolve(env.LOCAL_STORAGE_DIR)));
}

app.use(errorHandler);

export { app };
