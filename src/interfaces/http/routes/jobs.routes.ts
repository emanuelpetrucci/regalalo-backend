import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { PostgresItemRepository } from '../../../infrastructure/database/supabase/item.repository';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider';
import { SendNearbyItemsDigestUseCase } from '../../../application/use-cases/jobs/send-nearby-items-digest.use-case';
import { JobsController } from '../controllers/jobs.controller';
import { cronAuthMiddleware } from '../middlewares/cron-auth.middleware';
import { createJobsRateLimit } from '../middlewares/rate-limit';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IMailService } from '../../../domain/services/mail.service';

export interface JobsRouterDeps {
  itemRepo?: IItemRepository;
  mailService?: IMailService;
}

export function createJobsRouter(deps: JobsRouterDeps = {}): Router {
  const itemRepo = deps.itemRepo ?? new PostgresItemRepository(db);
  const mailService = deps.mailService ?? new ResendMailProvider();
  const useCase = new SendNearbyItemsDigestUseCase(itemRepo, mailService);
  const controller = new JobsController(useCase);

  const triggerHandler = (req: Request, res: Response, next: NextFunction) => {
    controller.nearbyItemsDigest(req, res).catch(next);
  };
  const jobsRateLimit = createJobsRateLimit();

  const router = Router();
  // GET accepted for cron services that don't support POST (e.g. cron-job.org)
  // no-store prevents reverse proxies from caching this side-effecting operation
  router.get('/nearby-items-digest', jobsRateLimit, cronAuthMiddleware, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, triggerHandler);
  router.post('/nearby-items-digest', jobsRateLimit, cronAuthMiddleware, triggerHandler);
  return router;
}
