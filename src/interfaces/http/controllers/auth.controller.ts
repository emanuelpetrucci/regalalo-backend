import { Request, Response, NextFunction } from 'express';
import { RegisterUserUseCase } from '../../../application/use-cases/user/register-user.use-case';
import { LoginUserUseCase } from '../../../application/use-cases/user/login-user.use-case';
import { ForgotPasswordUseCase } from '../../../application/use-cases/user/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../../application/use-cases/user/reset-password.use-case';
import { VerifyEmailUseCase } from '../../../application/use-cases/user/verify-email.use-case';
import { ResendVerificationUseCase } from '../../../application/use-cases/user/resend-verification.use-case';
import {
  RegisterRequestDto,
  LoginRequestDto,
} from '../../../application/dtos/auth.dto';
import {
  ForgotPasswordRequestDto,
  ResetPasswordRequestDto,
} from '../../../application/dtos/password-reset.dto';
import { VerifyEmailRequestDto } from '../../../application/dtos/email-verification.dto';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUserUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
  ) {}

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as RegisterRequestDto;
      const result = await this.registerUseCase.execute(dto);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as LoginRequestDto;
      const result = await this.loginUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as ForgotPasswordRequestDto;
      const result = await this.forgotPasswordUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = req.body as ResetPasswordRequestDto;
      const result = await this.resetPasswordUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = { token: req.query.token as string } satisfies VerifyEmailRequestDto;
      const result = await this.verifyEmailUseCase.execute(dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.resendVerificationUseCase.execute(req.currentUser!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
