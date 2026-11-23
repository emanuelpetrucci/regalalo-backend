import { Request, Response, NextFunction } from 'express';
import { AdminListUsersUseCase } from '../../../application/use-cases/admin/users/admin-list-users.use-case';
import { AdminGetUserDetailUseCase } from '../../../application/use-cases/admin/users/admin-get-user-detail.use-case';
import { AdminSuspendUserUseCase } from '../../../application/use-cases/admin/users/admin-suspend-user.use-case';
import { AdminReactivateUserUseCase } from '../../../application/use-cases/admin/users/admin-reactivate-user.use-case';
import { AdminForceVerificationUseCase } from '../../../application/use-cases/admin/users/admin-force-verification.use-case';
import { AdminCorrectReputationUseCase } from '../../../application/use-cases/admin/users/admin-correct-reputation.use-case';
import { AdminResetNoShowsUseCase } from '../../../application/use-cases/admin/users/admin-reset-no-shows.use-case';
import type { AdminUserListQuery } from '../../../application/dtos/admin/admin-user-list.dto';
import type { AdminCorrectReputationRequest } from '../../../application/dtos/admin/admin-action.dto';

export class AdminUsersController {
  constructor(
    private readonly listUsersUseCase: AdminListUsersUseCase,
    private readonly getUserDetailUseCase: AdminGetUserDetailUseCase,
    private readonly suspendUserUseCase: AdminSuspendUserUseCase,
    private readonly reactivateUserUseCase: AdminReactivateUserUseCase,
    private readonly forceVerificationUseCase: AdminForceVerificationUseCase,
    private readonly correctReputationUseCase: AdminCorrectReputationUseCase,
    private readonly resetNoShowsUseCase: AdminResetNoShowsUseCase,
  ) {}

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminUserListQuery;
      const result = await this.listUsersUseCase.execute(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getUserDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getUserDetailUseCase.execute(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async suspendUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.suspendUserUseCase.execute(
        req.adminUser!.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async reactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.reactivateUserUseCase.execute(
        req.adminUser!.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async forceVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.forceVerificationUseCase.execute(
        req.adminUser!.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async correctReputation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as AdminCorrectReputationRequest;
      const result = await this.correctReputationUseCase.execute(
        req.adminUser!.id,
        req.params.id,
        dto,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetNoShows(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.resetNoShowsUseCase.execute(
        req.adminUser!.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
