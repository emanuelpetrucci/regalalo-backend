import { Router } from 'express';
import multer from 'multer';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresItemRepository } from '../../../infrastructure/database/supabase/item.repository';
import { createStorageAdapter } from '../../../infrastructure/storage/create-storage-adapter';
import { NominatimAdapter } from '../../../infrastructure/geocoding/nominatim.adapter';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';
import { ListItemsUseCase } from '../../../application/use-cases/item/list-items.use-case';
import { GetItemUseCase } from '../../../application/use-cases/item/get-item.use-case';
import { CancelItemUseCase } from '../../../application/use-cases/item/cancel-item.use-case';
import { PauseItemUseCase } from '../../../application/use-cases/item/pause-item.use-case';
import { RequestItemUseCase } from '../../../application/use-cases/item/request-item.use-case';
import { GetRankedCandidatesUseCase } from '../../../application/use-cases/item/get-ranked-candidates.use-case';
import { SelectReceiverUseCase } from '../../../application/use-cases/item/select-receiver.use-case';
import { ItemController } from '../controllers/item.controller';
import { PostgresRequestRepository } from '../../../infrastructure/database/supabase/request.repository';
import { PostgresDeliverySessionRepository } from '../../../infrastructure/database/supabase/delivery-session.repository';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider';
import { createAuthMiddleware, createOptionalAuthMiddleware } from '../middlewares/auth.middleware';
import { createCandidatesRateLimit, createPublicItemsRateLimit } from '../middlewares/rate-limit';
import { validatePublishItemBody } from '../../validators/publish-item.validator';
import { validateListItemsQuery } from '../../validators/list-items.validator';
import { validateItemKeyParam } from '../../validators/item-key-param.validator';
import { validateUuidParam } from '../../validators/uuid-param.validator';
import { validatePauseItemBody } from '../../validators/pause-item.validator';
import { validateSelectReceiverBody } from '../../validators/select-receiver.validator';
import { validateRequestItemBody } from '../../validators/request-item.validator';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IStorageService } from '../../../domain/services/storage.service';
import { IGeocodingService } from '../../../application/services/geocoding.service';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

export interface ItemRouterDeps {
  itemRepo?: IItemRepository;
  requestRepo?: IRequestRepository;
  storageService?: IStorageService;
  geocodingService?: IGeocodingService;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
  mailService?: IMailService;
  deliverySessionRepo?: IDeliverySessionRepository;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Tipo de archivo no permitido'));
    }
  },
});

export function createItemRouter(deps: ItemRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const itemRepo = deps.itemRepo ?? new PostgresItemRepository(db);
  const storage = deps.storageService ?? createStorageAdapter(db);
  const geocoding = deps.geocodingService ?? new NominatimAdapter();
  const requestRepo = deps.requestRepo ?? new PostgresRequestRepository(db);
  const mailService = deps.mailService ?? new ResendMailProvider();

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(jwtService, userRepo);
  const publishItemUseCase = new PublishItemUseCase(itemRepo, storage, geocoding);
  const listItemsUseCase = new ListItemsUseCase(itemRepo);
  const getItemUseCase = new GetItemUseCase(itemRepo);
  const cancelItemUseCase = new CancelItemUseCase(itemRepo, userRepo, mailService);
  const pauseItemUseCase = new PauseItemUseCase(itemRepo);
  const requestItemUseCase = new RequestItemUseCase(itemRepo, requestRepo, userRepo, mailService);
  const getRankedCandidatesUseCase = new GetRankedCandidatesUseCase(itemRepo, requestRepo);
  const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);
  const selectReceiverUseCase = new SelectReceiverUseCase(itemRepo, requestRepo, deliverySessionRepo, userRepo, mailService);
  const candidatesRateLimit = createCandidatesRateLimit();
  const publicItemsRateLimit = createPublicItemsRateLimit();
  const controller = new ItemController(publishItemUseCase, listItemsUseCase, getItemUseCase, cancelItemUseCase, pauseItemUseCase, requestItemUseCase, getRankedCandidatesUseCase, selectReceiverUseCase);

  const router = Router();

  router.get(
    '/',
    publicItemsRateLimit,
    optionalAuthMiddleware,
    validateListItemsQuery,
    (req, res, next) => controller.listItems(req, res, next),
  );

  router.get(
    '/:id',
    publicItemsRateLimit,
    optionalAuthMiddleware,
    validateItemKeyParam('id'),
    (req, res, next) => controller.getItem(req, res, next),
  );

  router.post(
    '/',
    authMiddleware,
    upload.array('images', 5),
    validatePublishItemBody,
    (req, res, next) => controller.publishItem(req, res, next),
  );

  router.delete(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.cancelItem(req, res, next),
  );

  router.patch(
    '/:id/pause',
    authMiddleware,
    validateUuidParam('id'),
    validatePauseItemBody,
    (req, res, next) => controller.pauseItem(req, res, next),
  );

  router.get(
    '/:id/requests',
    candidatesRateLimit,
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getRankedCandidates(req, res, next),
  );

  router.post(
    '/:id/requests/:requestId/select',
    authMiddleware,
    validateUuidParam('id'),
    validateUuidParam('requestId'),
    validateSelectReceiverBody,
    (req, res, next) => controller.selectReceiver(req, res, next),
  );

  router.post(
    '/:id/requests',
    authMiddleware,
    validateUuidParam('id'),
    validateRequestItemBody,
    (req, res, next) => controller.requestItem(req, res, next),
  );

  return router;
}

export const itemRouter = createItemRouter();
