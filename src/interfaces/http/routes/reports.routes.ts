import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db.js';
import { JwtService } from '../../../infrastructure/security/jwt.service.js';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository.js';
import { PostgresItemRepository } from '../../../infrastructure/database/supabase/item.repository.js';
import { PostgresReportRepository } from '../../../infrastructure/database/supabase/report.repository.js';
import { RecaptchaService } from '../../../infrastructure/security/recaptcha.service.js';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider.js';
import { ItemReadService } from '../../../application/services/item-read.service.js';
import { CreateReportUseCase } from '../../../application/use-cases/reports/create-report.use-case.js';
import { ReportController } from '../controllers/report.controller.js';
import { createAuthMiddleware } from '../middlewares/auth.middleware.js';
import { reportRateLimit } from '../middlewares/report-rate-limit.js';
import { validateCreateReportBody } from '../../validators/report.validator.js';
import { IItemRepository } from '../../../domain/repositories/item.repository.js';
import { IUserRepository } from '../../../domain/repositories/user.repository.js';
import { IReportRepository } from '../../../domain/repositories/report.repository.js';
import { IRecaptchaService } from '../../../application/services/recaptcha.service.js';
import { IMailService } from '../../../domain/services/mail.service.js';

export interface ReportRouterDeps {
  itemRepo?: IItemRepository;
  userRepo?: IUserRepository;
  reportRepo?: IReportRepository;
  recaptchaService?: IRecaptchaService;
  mailService?: IMailService;
}

export function createReportRouter(deps: ReportRouterDeps = {}): Router {
  const jwtService = new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const itemRepo = deps.itemRepo ?? new PostgresItemRepository(db);
  const reportRepo = deps.reportRepo ?? new PostgresReportRepository(db);
  const recaptchaService = deps.recaptchaService ?? new RecaptchaService();
  const mailService = deps.mailService ?? new ResendMailProvider();

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const itemReadService = new ItemReadService(itemRepo, userRepo);
  const createReportUseCase = new CreateReportUseCase(reportRepo, itemReadService, recaptchaService, mailService);
  const controller = new ReportController(createReportUseCase);

  const router = Router();

  router.post(
    '/',
    authMiddleware,
    reportRateLimit,
    validateCreateReportBody,
    (req, res, next) => controller.createReport(req, res, next),
  );

  return router;
}
