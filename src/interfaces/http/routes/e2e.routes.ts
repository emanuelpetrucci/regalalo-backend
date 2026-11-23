import { Router } from 'express';
import { E2eController } from '../controllers/e2e.controller';
import { e2eAuthMiddleware } from '../../../e2e/e2e-auth.middleware';
import { validateUuidParam } from '../../validators/uuid-param.validator';

export function createE2eRouter(): Router {
  const controller = new E2eController();
  const router = Router();

  router.use(e2eAuthMiddleware);

  router.get('/health', (req, res) => controller.health(req, res));
  router.post('/database/purge', (req, res, next) => controller.purge(req, res, next));
  router.post('/database/recreate', (req, res, next) => controller.recreate(req, res, next));
  router.post('/scenarios/:name', (req, res, next) => controller.resetScenario(req, res, next));

  router.post(
    '/time/degrade-item/:itemId',
    validateUuidParam('itemId'),
    (req, res, next) => controller.degradeItem(req, res, next),
  );
  router.post(
    '/time/expire-session/:sessionId',
    validateUuidParam('sessionId'),
    (req, res, next) => controller.expireSession(req, res, next),
  );
  router.post(
    '/time/backdate-item-completed/:itemId',
    validateUuidParam('itemId'),
    (req, res, next) => controller.backdateItemCompleted(req, res, next),
  );
  router.post(
    '/time/purge-contact/:sessionId',
    validateUuidParam('sessionId'),
    (req, res, next) => controller.purgeContact(req, res, next),
  );
  router.post(
    '/time/purge-images-view/:itemId',
    validateUuidParam('itemId'),
    (req, res, next) => controller.purgeImagesView(req, res, next),
  );
  router.post(
    '/time/increment-cycles/:userId',
    validateUuidParam('userId'),
    (req, res, next) => controller.incrementCycles(req, res, next),
  );
  router.post(
    '/auth/issue-reset-token/:userId',
    validateUuidParam('userId'),
    (req, res, next) => controller.issueResetToken(req, res, next),
  );
  router.post(
    '/auth/verify-email/:userId',
    validateUuidParam('userId'),
    (req, res, next) => controller.verifyUserEmail(req, res, next),
  );

  return router;
}
