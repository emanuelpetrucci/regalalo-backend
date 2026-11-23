import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { PostgresAdminUserRepository } from '../../../infrastructure/database/supabase/admin-user.repository';
import { PostgresAdminOtpTokenRepository } from '../../../infrastructure/database/supabase/admin-otp-token.repository';
import { PostgresAdminAuditLogRepository } from '../../../infrastructure/database/supabase/admin-audit-log.repository';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresItemRepository } from '../../../infrastructure/database/supabase/item.repository';
import { Argon2HashService } from '../../../infrastructure/security/argon2.service';
import { AdminJwtService } from '../../../infrastructure/security/admin-jwt.service';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider';
import { AdminLoginUseCase } from '../../../application/use-cases/admin/auth/admin-login.use-case';
import { AdminVerifyOtpUseCase } from '../../../application/use-cases/admin/auth/admin-verify-otp.use-case';
import { AdminListUsersUseCase } from '../../../application/use-cases/admin/users/admin-list-users.use-case';
import { AdminGetUserDetailUseCase } from '../../../application/use-cases/admin/users/admin-get-user-detail.use-case';
import { AdminSuspendUserUseCase } from '../../../application/use-cases/admin/users/admin-suspend-user.use-case';
import { AdminReactivateUserUseCase } from '../../../application/use-cases/admin/users/admin-reactivate-user.use-case';
import { AdminForceVerificationUseCase } from '../../../application/use-cases/admin/users/admin-force-verification.use-case';
import { AdminCorrectReputationUseCase } from '../../../application/use-cases/admin/users/admin-correct-reputation.use-case';
import { AdminResetNoShowsUseCase } from '../../../application/use-cases/admin/users/admin-reset-no-shows.use-case';
import { AdminListItemsUseCase } from '../../../application/use-cases/admin/items/admin-list-items.use-case';
import { AdminGetItemDetailUseCase } from '../../../application/use-cases/admin/items/admin-get-item-detail.use-case';
import { AdminCancelItemUseCase } from '../../../application/use-cases/admin/items/admin-cancel-item.use-case';
import { AdminReactivateItemUseCase } from '../../../application/use-cases/admin/items/admin-reactivate-item.use-case';
import { AdminListSessionsUseCase } from '../../../application/use-cases/admin/sessions/admin-list-sessions.use-case';
import { AdminGetSessionDetailUseCase } from '../../../application/use-cases/admin/sessions/admin-get-session-detail.use-case';
import { AdminForceExpireSessionUseCase } from '../../../application/use-cases/admin/sessions/admin-force-expire-session.use-case';
import { AdminGetMetricsUseCase } from '../../../application/use-cases/admin/metrics/admin-get-metrics.use-case';
import { AdminGetSystemHealthUseCase } from '../../../application/use-cases/admin/metrics/admin-get-system-health.use-case';
import { AdminListReportsUseCase } from '../../../application/use-cases/admin/reports/admin-list-reports.use-case';
import { AdminGetReportDetailUseCase } from '../../../application/use-cases/admin/reports/admin-get-report-detail.use-case';
import { AdminResolveReportUseCase } from '../../../application/use-cases/admin/reports/admin-resolve-report.use-case.js';
import { PostgresDeliverySessionRepository } from '../../../infrastructure/database/supabase/delivery-session.repository';
import { PostgresAdminSystemHealthRepository } from '../../../infrastructure/database/supabase/admin-system-health.repository';
import { PostgresReportRepository } from '../../../infrastructure/database/supabase/report.repository';
import { AdminAuthController } from '../controllers/admin-auth.controller';
import { AdminUsersController } from '../controllers/admin-users.controller';
import { AdminItemsController } from '../controllers/admin-items.controller';
import { AdminSessionsController } from '../controllers/admin-sessions.controller';
import { AdminMetricsController } from '../controllers/admin-metrics.controller';
import { AdminReportsController } from '../controllers/admin-reports.controller';
import { createRequireAdminAuthMiddleware } from '../middlewares/require-admin-auth.middleware';
import { validateAdminLoginBody } from '../../validators/admin-login.validator';
import { validateAdminVerifyOtpBody } from '../../validators/admin-verify-otp.validator';
import { validateAdminListUsers } from '../../validators/admin-list-users.validator';
import { validateAdminUuidParam } from '../../validators/admin-uuid-param.validator';
import { validateAdminCorrectReputation } from '../../validators/admin-correct-reputation.validator';
import { validateAdminListItems } from '../../validators/admin-list-items.validator';
import { validateAdminListSessions } from '../../validators/admin-list-sessions.validator';
import { validateAdminListReports } from '../../validators/admin-list-reports.validator';
import { validateAdminResolveReport } from '../../validators/admin-resolve-report.validator.js';
import { IAdminUserRepository } from '../../../domain/repositories/admin-user.repository';
import { IAdminOtpTokenRepository } from '../../../domain/repositories/admin-otp-token.repository';
import { IAdminAuditLogRepository } from '../../../domain/repositories/admin-audit-log.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IAdminSystemHealthRepository } from '../../../domain/repositories/admin-system-health.repository';
import { IReportRepository } from '../../../domain/repositories/report.repository';
import { IHashService } from '../../../domain/services/hash.service';
import { IJwtService } from '../../../application/services/jwt.service';
import { IMailService } from '../../../domain/services/mail.service';

export interface AdminRouterDeps {
  adminUserRepo?: IAdminUserRepository;
  adminOtpTokenRepo?: IAdminOtpTokenRepository;
  adminAuditLogRepo?: IAdminAuditLogRepository;
  userRepo?: IUserRepository;
  itemRepo?: IItemRepository;
  deliverySessionRepo?: IDeliverySessionRepository;
  systemHealthRepo?: IAdminSystemHealthRepository;
  reportRepo?: IReportRepository;
  hashService?: IHashService;
  adminJwtService?: IJwtService;
  mailService?: IMailService;
}

export function createAdminRouter(deps: AdminRouterDeps = {}): Router {
  const adminUserRepo = deps.adminUserRepo ?? new PostgresAdminUserRepository(db);
  const adminOtpTokenRepo = deps.adminOtpTokenRepo ?? new PostgresAdminOtpTokenRepository(db);
  const adminAuditLogRepo = deps.adminAuditLogRepo ?? new PostgresAdminAuditLogRepository(db);
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const itemRepo = deps.itemRepo ?? new PostgresItemRepository(db);
  const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);
  const systemHealthRepo = deps.systemHealthRepo ?? new PostgresAdminSystemHealthRepository(db);
  const reportRepo = deps.reportRepo ?? new PostgresReportRepository(db);
  const hashService = deps.hashService ?? new Argon2HashService();
  const adminJwtService = deps.adminJwtService ?? new AdminJwtService();
  const mailService = deps.mailService ?? new ResendMailProvider();

  const loginUseCase = new AdminLoginUseCase(
    adminUserRepo,
    hashService,
    adminOtpTokenRepo,
    mailService,
    adminAuditLogRepo,
  );

  const verifyOtpUseCase = new AdminVerifyOtpUseCase(
    adminUserRepo,
    adminOtpTokenRepo,
    adminAuditLogRepo,
    adminJwtService,
  );

  const authController = new AdminAuthController(loginUseCase, verifyOtpUseCase);

  const usersController = new AdminUsersController(
    new AdminListUsersUseCase(userRepo),
    new AdminGetUserDetailUseCase(userRepo),
    new AdminSuspendUserUseCase(userRepo, adminAuditLogRepo),
    new AdminReactivateUserUseCase(userRepo, adminAuditLogRepo),
    new AdminForceVerificationUseCase(userRepo, adminAuditLogRepo, mailService),
    new AdminCorrectReputationUseCase(userRepo, adminAuditLogRepo),
    new AdminResetNoShowsUseCase(userRepo, adminAuditLogRepo),
  );

  const itemsController = new AdminItemsController(
    new AdminListItemsUseCase(itemRepo),
    new AdminGetItemDetailUseCase(itemRepo),
    new AdminCancelItemUseCase(itemRepo, userRepo, mailService, adminAuditLogRepo),
    new AdminReactivateItemUseCase(itemRepo, adminAuditLogRepo),
  );

  const sessionsController = new AdminSessionsController(
    new AdminListSessionsUseCase(deliverySessionRepo),
    new AdminGetSessionDetailUseCase(deliverySessionRepo, adminAuditLogRepo),
    new AdminForceExpireSessionUseCase(deliverySessionRepo, adminAuditLogRepo),
  );

  const metricsController = new AdminMetricsController(
    new AdminGetMetricsUseCase(userRepo, itemRepo, deliverySessionRepo, reportRepo),
    new AdminGetSystemHealthUseCase(systemHealthRepo),
  );

  const reportsController = new AdminReportsController(
    new AdminListReportsUseCase(reportRepo),
    new AdminGetReportDetailUseCase(reportRepo, adminAuditLogRepo),
    new AdminResolveReportUseCase(
      reportRepo,
      userRepo,
      adminAuditLogRepo,
      mailService,
      new AdminCancelItemUseCase(itemRepo, userRepo, mailService, adminAuditLogRepo),
      new AdminSuspendUserUseCase(userRepo, adminAuditLogRepo),
    ),
  );

  const requireAdminAuth = createRequireAdminAuthMiddleware(adminJwtService, adminUserRepo);

  const router = Router();

  router.post('/auth/login', validateAdminLoginBody, (req, res, next) =>
    authController.login(req, res, next),
  );

  router.post('/auth/verify-otp', validateAdminVerifyOtpBody, (req, res, next) =>
    authController.verifyOtp(req, res, next),
  );

  router.use(requireAdminAuth);

  router.get('/users', validateAdminListUsers, (req, res, next) =>
    usersController.listUsers(req, res, next),
  );
  router.get('/users/:id', validateAdminUuidParam, (req, res, next) =>
    usersController.getUserDetail(req, res, next),
  );
  router.post('/users/:id/suspend', validateAdminUuidParam, (req, res, next) =>
    usersController.suspendUser(req, res, next),
  );
  router.post('/users/:id/reactivate', validateAdminUuidParam, (req, res, next) =>
    usersController.reactivateUser(req, res, next),
  );
  router.post('/users/:id/force-verification', validateAdminUuidParam, (req, res, next) =>
    usersController.forceVerification(req, res, next),
  );
  router.post(
    '/users/:id/correct-reputation',
    validateAdminUuidParam,
    validateAdminCorrectReputation,
    (req, res, next) => usersController.correctReputation(req, res, next),
  );
  router.post('/users/:id/reset-no-shows', validateAdminUuidParam, (req, res, next) =>
    usersController.resetNoShows(req, res, next),
  );

  router.get('/items', validateAdminListItems, (req, res, next) =>
    itemsController.listItems(req, res, next),
  );
  router.get('/items/:id', validateAdminUuidParam, (req, res, next) =>
    itemsController.getItemDetail(req, res, next),
  );
  router.post('/items/:id/cancel', validateAdminUuidParam, (req, res, next) =>
    itemsController.cancelItem(req, res, next),
  );
  router.post('/items/:id/reactivate', validateAdminUuidParam, (req, res, next) =>
    itemsController.reactivateItem(req, res, next),
  );

  router.get('/sessions', validateAdminListSessions, (req, res, next) =>
    sessionsController.listSessions(req, res, next),
  );
  router.get('/sessions/:id', validateAdminUuidParam, (req, res, next) =>
    sessionsController.getSessionDetail(req, res, next),
  );
  router.post('/sessions/:id/force-expire', validateAdminUuidParam, (req, res, next) =>
    sessionsController.forceExpireSession(req, res, next),
  );

  router.get('/metrics', (req, res, next) => metricsController.getMetrics(req, res, next));
  router.get('/system/health', (req, res, next) => metricsController.getSystemHealth(req, res, next));

  router.get('/reports', validateAdminListReports, (req, res, next) =>
    reportsController.listReports(req, res, next),
  );
  router.get('/reports/:id', validateAdminUuidParam, (req, res, next) =>
    reportsController.getReportDetail(req, res, next),
  );
  router.post('/reports/:id/resolve', validateAdminUuidParam, validateAdminResolveReport, (req, res, next) =>
    reportsController.resolveReport(req, res, next),
  );

  return router;
}
