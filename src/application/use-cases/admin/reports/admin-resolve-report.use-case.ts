import { IReportRepository } from '../../../../domain/repositories/report.repository.js';
import { IUserRepository } from '../../../../domain/repositories/user.repository.js';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository.js';
import { IMailService } from '../../../../domain/services/mail.service.js';
import { AdminCancelItemUseCase } from '../items/admin-cancel-item.use-case.js';
import { AdminSuspendUserUseCase } from '../users/admin-suspend-user.use-case.js';
import type { ResolveReportResponseDto } from '../../../dtos/report/resolve-report.dto.js';
import type { ResolutionAction } from '../../../../domain/entities/report.entity.js';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception.js';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception.js';
import { UnprocessableEntityException } from '../../../../domain/exceptions/unprocessable-entity.exception.js';
import { appLogger } from '../../../../config/loggers.js';
import { safeEmitEvent } from '../../../../application/services/analytics.service.js';
import type { AppPreferredLanguage } from '../../../../interfaces/validators/preferred-language.schema.js';

export class AdminResolveReportUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
    private readonly mailService: IMailService,
    private readonly cancelItemUseCase: AdminCancelItemUseCase,
    private readonly suspendUserUseCase: AdminSuspendUserUseCase,
  ) {}

  async execute(
    adminUserId: string,
    reportId: string,
    action: ResolutionAction,
    resolutionNote: string,
    ipAddress: string,
  ): Promise<ResolveReportResponseDto> {
    const report = await this.reportRepo.findByIdAdmin(reportId);
    if (!report) throw new NotFoundException('Report not found');

    if (report.status !== 'pending') throw new ConflictException('REPORT_ALREADY_CLOSED');

    if (action === 'cancel_item' && report.reportedEntityType !== 'item') {
      throw new UnprocessableEntityException('ACTION_ENTITY_MISMATCH');
    }
    if ((action === 'warn_user' || action === 'suspend_user') && report.reportedEntityType !== 'user') {
      throw new UnprocessableEntityException('ACTION_ENTITY_MISMATCH');
    }

    const payloadSnapshot = {
      status: report.status,
      reason: report.reason,
      reported_entity_type: report.reportedEntityType,
      reported_entity_id: report.reportedEntityId,
      action,
      resolutionNote,
    };

    if (action === 'cancel_item') {
      await this.cancelItemUseCase.execute(adminUserId, report.reportedEntityId, ipAddress);
    } else if (action === 'suspend_user') {
      await this.suspendUserUseCase.execute(adminUserId, report.reportedEntityId, ipAddress);
    }

    const newStatus = action === 'archive' ? 'archived' : 'resolved';

    const resolvedAt = new Date();
    await this.reportRepo.update(reportId, {
      status: newStatus as 'resolved' | 'archived',
      resolvedAt,
      resolvedBy: adminUserId,
      resolutionAction: action,
      resolutionNote,
    });

    try {
      await this.auditLogRepo.create({
        adminUserId,
        action: 'report.resolved',
        entityType: 'report',
        entityId: reportId,
        payloadSnapshot,
        ipAddress,
      });
    } catch (err) {
      appLogger.error({ err, reportId }, 'Audit log failed after report resolved');
    }

    if (report.reporter !== null && report.reporter.id !== null && report.reporter.email) {
      this.mailService
        .send({
          to: report.reporter.email,
          templateId: 'TPL-012',
          variables: {
            recipientEmail: report.reporter.email,
            firstName: report.reporter.firstName ?? '',
            reportedEntityType: report.reportedEntityType,
          },
          language: (report.reporter.preferredLanguage ?? undefined) as AppPreferredLanguage | undefined,
        })
        .catch((err) => appLogger.error({ err, reportId, templateId: 'TPL-012' }, 'Email notification failed'));

      try {
        await this.auditLogRepo.create({
          adminUserId,
          action: 'email.attempted',
          entityType: 'report',
          entityId: reportId,
          payloadSnapshot: { templateId: 'TPL-012' },
          ipAddress,
        });
      } catch (err) {
        appLogger.error({ err, reportId }, 'Audit log failed for TPL-012 notification');
      }
    }

    if (action === 'warn_user') {
      let reportedUserEmail: string | null = null;
      try {
        const reportedUser = await this.userRepo.findById(report.reportedEntityId);
        if (reportedUser) {
          reportedUserEmail = reportedUser.email;
          this.mailService
            .send({
              to: reportedUser.email,
              templateId: 'TPL-013',
              variables: {
                recipientEmail: reportedUser.email,
                firstName: reportedUser.firstName,
              },
              language: reportedUser.preferredLanguage,
            })
            .catch((err) => appLogger.error({ err, reportId, templateId: 'TPL-013' }, 'Email notification failed'));
        } else {
          appLogger.warn({ reportedEntityId: report.reportedEntityId }, 'TPL-013 skipped: reported user not found');
        }
      } catch (err) {
        appLogger.error({ err, reportedEntityId: report.reportedEntityId }, 'TPL-013 user lookup failed');
      }
      if (reportedUserEmail) {
        try {
          await this.auditLogRepo.create({
            adminUserId,
            action: 'email.sent',
            entityType: 'report',
            entityId: reportId,
            payloadSnapshot: { templateId: 'TPL-013' },
            ipAddress,
          });
        } catch (err) {
          appLogger.error({ err, reportId }, 'Audit log failed for TPL-013 notification');
        }
      }
    }

    // AE-033 — post-commit, fire-and-forget
    try {
      const resolutionTimeHours = Math.max(0, Math.round(
        (resolvedAt.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60),
      ));
      safeEmitEvent('report.resolved', adminUserId, {
        action,
        entityType: report.reportedEntityType,
        resolutionTimeHours,
      });
    } catch (err) {
      appLogger.error({ err, reportId }, 'AE-033 analytics emit failed');
    }

    return { message: 'Reporte cerrado', action, reportId };
  }
}
