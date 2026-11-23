import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import './registry';
import { registry } from './registry';
import { registerOpenApiPaths } from './register-paths';

let documentCache: ReturnType<OpenApiGeneratorV3['generateDocument']> | null = null;

export function generateOpenApiDocument() {
  if (documentCache) {
    return documentCache;
  }

  registerOpenApiPaths();

  const generator = new OpenApiGeneratorV3(registry.definitions);
  documentCache = generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Regálalo API',
      version: '1.0.0',
      description:
        'API REST del backend Regálalo. Autenticación JWT vía header Authorization: Bearer.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    tags: [
      { name: 'Health' },
      { name: 'Auth' },
      { name: 'Items' },
      { name: 'Users' },
      { name: 'Delivery' },
    ],
  });

  return documentCache;
}

export function resetOpenApiDocumentCache(): void {
  documentCache = null;
}
