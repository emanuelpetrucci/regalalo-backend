import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresDeliverySessionRepository } from '../../../infrastructure/database/supabase/delivery-session.repository';
import { GetDeliverySessionUseCase } from '../../../application/use-cases/delivery-session/get-delivery-session.use-case';
import { ConfirmDeliveryUseCase } from '../../../application/use-cases/delivery-session/confirm-delivery.use-case';
import { CancelDeliveryUseCase } from '../../../application/use-cases/delivery-session/cancel-delivery.use-case';
import { DeliverySessionController } from '../controllers/delivery-session.controller';
import { validateCancelDeliveryBody } from '../../validators/cancel-delivery.validator';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validateUuidParam } from '../../validators/uuid-param.validator';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';

export interface DeliverySessionRouterDeps {
  deliverySessionRepo?: IDeliverySessionRepository;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
}

export function createDeliverySessionRouter(deps: DeliverySessionRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const confirmDeliveryUseCase = new ConfirmDeliveryUseCase(deliverySessionRepo);
  const cancelDeliveryUseCase = new CancelDeliveryUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(
    getDeliverySessionUseCase,
    confirmDeliveryUseCase,
    cancelDeliveryUseCase,
  );

  const router = Router();

  router.get(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getDeliverySession(req, res, next),
  );

  router.post(
    '/:id/confirm',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.confirmDelivery(req, res, next),
  );

  router.post(
    '/:id/cancel',
    authMiddleware,
    validateUuidParam('id'),
    validateCancelDeliveryBody,
    (req, res, next) => controller.cancelDelivery(req, res, next),
  );

  return router;
}

export const deliverySessionRouter = createDeliverySessionRouter();
