import type { IReportRepository, AdminReportQuery } from '../../../../domain/repositories/report.repository';
import type { ReportListResponseDto } from '../../../dtos/report/report-list.dto';

export class AdminListReportsUseCase {
  constructor(private readonly reportRepo: IReportRepository) {}

  async execute(query: AdminReportQuery): Promise<ReportListResponseDto> {
    const { reports: records, total } = await this.reportRepo.findAllAdmin(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      reports: records,
      pagination: { total, page: query.page, limit: query.limit, totalPages },
    };
  }
}
