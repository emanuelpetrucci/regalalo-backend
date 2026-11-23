import type { IReportRepository } from '../../../../domain/repositories/report.repository';
import type { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import type { ReportDetailResponseDto } from '../../../dtos/report/report-detail.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';

export class AdminGetReportDetailUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(adminUserId: string, reportId: string, ipAddress: string): Promise<ReportDetailResponseDto> {
    const record = await this.reportRepo.findByIdAdmin(reportId);
    if (!record) throw new NotFoundException('Report not found');

    try {
      await this.auditLogRepo.create({
        adminUserId,
        action: 'report.viewed',
        entityType: 'report',
        entityId: reportId,
        ipAddress,
      });
    } catch {
      // Log fire-and-forget: audit failure must not block the response
    }

    return record;
  }
}
