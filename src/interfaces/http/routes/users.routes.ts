import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';
import { GetMyDeliverySessionsUseCase } from '../../../application/use-cases/user/get-my-delivery-sessions.use-case';
import { GetMyItemsUseCase } from '../../../application/use-cases/user/get-my-items.use-case';
import { GetMyRequestsUseCase } from '../../../application/use-cases/user/get-my-requests.use-case';
import { GetPublicProfileUseCase } from '../../../application/use-cases/user/get-public-profile.use-case';
import { UpdateProfileUseCase } from '../../../application/use-cases/user/update-profile.use-case';
import { UserController } from '../controllers/user.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validateListMyDeliverySessionsQuery } from '../../validators/list-my-delivery-sessions.validator';
import { validateListMyItemsQuery } from '../../validators/list-my-items.validator';
import { validateListMyRequestsQuery } from '../../validators/list-my-requests.validator';
import { validateUpdateProfileBody } from '../../validators/update-profile.validator';
import { validateUuidParam } from '../../validators/uuid-param.validator';
import { IJwtService } from '../../../application/services/jwt.service';
import { IGeocodingService } from '../../../application/services/geocoding.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { NominatimAdapter } from '../../../infrastructure/geocoding/nominatim.adapter';

export interface UserRouterDeps {
  userRepo?: IUserRepository;
  jwtService?: IJwtService;
  geocodingService?: IGeocodingService;
}

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const geocodingService = deps.geocodingService ?? new NominatimAdapter();

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getPrivateProfileUseCase = new GetPrivateProfileUseCase(userRepo);
  const getReputationHistoryUseCase = new GetReputationHistoryUseCase(userRepo);
  const getMyDeliverySessionsUseCase = new GetMyDeliverySessionsUseCase(userRepo);
  const getMyItemsUseCase = new GetMyItemsUseCase(userRepo);
  const getMyRequestsUseCase = new GetMyRequestsUseCase(userRepo);
  const getPublicProfileUseCase = new GetPublicProfileUseCase(userRepo);
  const updateProfileUseCase = new UpdateProfileUseCase(userRepo, geocodingService);
  const controller = new UserController(
    getPrivateProfileUseCase,
    getReputationHistoryUseCase,
    getMyDeliverySessionsUseCase,
    getMyItemsUseCase,
    getMyRequestsUseCase,
    getPublicProfileUseCase,
    updateProfileUseCase,
  );

  const router = Router();

  router.get(
    '/me',
    authMiddleware,
    (req, res, next) => controller.getPrivateProfile(req, res, next),
  );

  router.patch(
    '/me',
    authMiddleware,
    validateUpdateProfileBody,
    (req, res, next) => controller.updateProfile(req, res, next),
  );

  router.get(
    '/me/reputation-history',
    authMiddleware,
    (req, res, next) => controller.getReputationHistory(req, res, next),
  );

  router.get(
    '/me/delivery-sessions',
    authMiddleware,
    validateListMyDeliverySessionsQuery,
    (req, res, next) => controller.getMyDeliverySessions(req, res, next),
  );

  router.get(
    '/me/items',
    authMiddleware,
    validateListMyItemsQuery,
    (req, res, next) => controller.getMyItems(req, res, next),
  );

  router.get(
    '/me/requests',
    authMiddleware,
    validateListMyRequestsQuery,
    (req, res, next) => controller.getMyRequests(req, res, next),
  );

  router.get(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getPublicProfile(req, res, next),
  );

  return router;
}

export const userRouter = createUserRouter();
