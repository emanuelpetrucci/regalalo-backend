import { Request, Response, NextFunction } from 'express';
import { AdminListReportsUseCase } from '../../../application/use-cases/admin/reports/admin-list-reports.use-case';
import { AdminGetReportDetailUseCase } from '../../../application/use-cases/admin/reports/admin-get-report-detail.use-case';
import { AdminResolveReportUseCase } from '../../../application/use-cases/admin/reports/admin-resolve-report.use-case.js';
import type { AdminReportQuery } from '../../../domain/repositories/report.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

function assertAdminUser(req: Request): { id: string } {
  if (!req.adminUser) throw new UnauthorizedException('Authentication required');
  return req.adminUser;
}

export class AdminReportsController {
  constructor(
    private readonly listReportsUseCase: AdminListReportsUseCase,
    private readonly getReportDetailUseCase: AdminGetReportDetailUseCase,
    private readonly resolveReportUseCase: AdminResolveReportUseCase,
  ) {}

  async listReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      assertAdminUser(req);
      const query = req.query as unknown as AdminReportQuery;
      const result = await this.listReportsUseCase.execute(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getReportDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.getReportDetailUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resolveReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.resolveReportUseCase.execute(
        adminUser.id,
        req.params.id,
        req.body.action,
        req.body.resolutionNote,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
