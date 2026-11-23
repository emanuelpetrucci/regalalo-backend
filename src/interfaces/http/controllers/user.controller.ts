import { Request, Response, NextFunction } from 'express';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';
import { GetMyDeliverySessionsUseCase } from '../../../application/use-cases/user/get-my-delivery-sessions.use-case';
import { GetMyItemsUseCase } from '../../../application/use-cases/user/get-my-items.use-case';
import { GetMyRequestsUseCase } from '../../../application/use-cases/user/get-my-requests.use-case';
import { GetPublicProfileUseCase } from '../../../application/use-cases/user/get-public-profile.use-case';
import { UpdateProfileUseCase } from '../../../application/use-cases/user/update-profile.use-case';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { UpdateProfileRequestDto } from '../../../application/dtos/update-profile.dto';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
    private readonly getMyDeliverySessionsUseCase: GetMyDeliverySessionsUseCase,
    private readonly getMyItemsUseCase: GetMyItemsUseCase,
    private readonly getMyRequestsUseCase: GetMyRequestsUseCase,
    private readonly getPublicProfileUseCase: GetPublicProfileUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
  ) {}

  async getPrivateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getPrivateProfileUseCase.execute(req.currentUser.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getReputationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getReputationHistoryUseCase.execute(req.currentUser.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMyDeliverySessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getMyDeliverySessionsUseCase.execute({
        userId: req.currentUser.id,
        role: req.query.role as 'donor' | 'receiver' | undefined,
        status: req.query.status as 'active' | 'completed' | 'cancelled' | 'expired' | undefined,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMyItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getMyItemsUseCase.execute({
        userId: req.currentUser.id,
        status: req.query.status as 'active' | 'reserved' | 'completed' | 'cancelled' | undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMyRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getMyRequestsUseCase.execute({
        userId: req.currentUser.id,
        status: req.query.status as 'pending' | 'selected' | 'rejected' | 'cancelled' | undefined,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.getPublicProfileUseCase.execute(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) {
        next(new UnauthorizedException());
        return;
      }
      const result = await this.updateProfileUseCase.execute(
        req.currentUser.id,
        req.body as UpdateProfileRequestDto,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
