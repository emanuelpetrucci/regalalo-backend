import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '../zod';

export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export const cronSecretAuth = registry.registerComponent('securitySchemes', 'cronSecret', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Cron-Secret',
});

export { z };
