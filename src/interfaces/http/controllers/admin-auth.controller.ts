import { Request, Response, NextFunction } from 'express';
import { AdminLoginUseCase } from '../../../application/use-cases/admin/auth/admin-login.use-case';
import { AdminVerifyOtpUseCase } from '../../../application/use-cases/admin/auth/admin-verify-otp.use-case';
import { AdminLoginRequest } from '../../../application/dtos/admin/auth/login.dto';
import { AdminVerifyOtpRequest } from '../../../application/dtos/admin/auth/verify-otp.dto';

export class AdminAuthController {
  constructor(
    private readonly loginUseCase: AdminLoginUseCase,
    private readonly verifyOtpUseCase: AdminVerifyOtpUseCase,
  ) {}

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto: AdminLoginRequest = {
        ...(req.body as Omit<AdminLoginRequest, 'ipAddress'>),
        ipAddress: req.ip ?? '',
      };
      const result = await this.loginUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto: AdminVerifyOtpRequest = {
        ...(req.body as Omit<AdminVerifyOtpRequest, 'ipAddress'>),
        ipAddress: req.ip ?? '',
      };
      const result = await this.verifyOtpUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
