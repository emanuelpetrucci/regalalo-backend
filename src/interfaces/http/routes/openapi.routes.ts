import '../../../openapi/registry';
import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from '../../../openapi/document';

export function createOpenApiRouter(): Router {
  const router = Router();
  const document = generateOpenApiDocument();

  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });

  router.use('/docs', swaggerUi.serve);
  router.get('/docs', swaggerUi.setup(document));

  return router;
}
