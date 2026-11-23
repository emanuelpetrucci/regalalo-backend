import { Request, Response, NextFunction } from 'express';
import { AdminListSessionsUseCase } from '../../../application/use-cases/admin/sessions/admin-list-sessions.use-case';
import { AdminGetSessionDetailUseCase } from '../../../application/use-cases/admin/sessions/admin-get-session-detail.use-case';
import { AdminForceExpireSessionUseCase } from '../../../application/use-cases/admin/sessions/admin-force-expire-session.use-case';
import type { AdminSessionListQuery } from '../../../application/dtos/admin/admin-session-list.dto';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

function assertAdminUser(req: Request): { id: string } {
  if (!req.adminUser) {
    throw new UnauthorizedException('Authentication required');
  }
  return req.adminUser;
}

export class AdminSessionsController {
  constructor(
    private readonly listSessionsUseCase: AdminListSessionsUseCase,
    private readonly getSessionDetailUseCase: AdminGetSessionDetailUseCase,
    private readonly forceExpireSessionUseCase: AdminForceExpireSessionUseCase,
  ) {}

  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminSessionListQuery;
      const result = await this.listSessionsUseCase.execute(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getSessionDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.getSessionDetailUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async forceExpireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.forceExpireSessionUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
