import { Request, Response, NextFunction } from 'express';
import { CreateReportUseCase } from '../../../application/use-cases/reports/create-report.use-case.js';

export class ReportController {
  constructor(private readonly createReportUseCase: CreateReportUseCase) {}

  async createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reporterId = req.currentUser!.id;
      const reporterEmail = req.currentUser!.email;
      const reporterLanguage = req.currentUser!.preferredLanguage;
      const result = await this.createReportUseCase.execute(req.body, reporterId, reporterEmail, reporterLanguage);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
}
