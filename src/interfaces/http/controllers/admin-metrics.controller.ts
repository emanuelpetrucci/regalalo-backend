import { Request, Response, NextFunction } from 'express';
import { AdminGetMetricsUseCase } from '../../../application/use-cases/admin/metrics/admin-get-metrics.use-case';
import { AdminGetSystemHealthUseCase } from '../../../application/use-cases/admin/metrics/admin-get-system-health.use-case';

export class AdminMetricsController {
  constructor(
    private readonly getMetricsUseCase: AdminGetMetricsUseCase,
    private readonly getSystemHealthUseCase: AdminGetSystemHealthUseCase,
  ) {}

  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getMetricsUseCase.execute();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getSystemHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getSystemHealthUseCase.execute();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
