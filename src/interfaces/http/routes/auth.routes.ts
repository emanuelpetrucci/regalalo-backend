import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresPasswordResetTokenRepository } from '../../../infrastructure/database/supabase/password-reset-token.repository';
import { Argon2HashService } from '../../../infrastructure/security/argon2.service';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { RecaptchaService } from '../../../infrastructure/security/recaptcha.service';
import { NominatimAdapter } from '../../../infrastructure/geocoding/nominatim.adapter';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider';
import { RegisterUserUseCase } from '../../../application/use-cases/user/register-user.use-case';
import { LoginUserUseCase } from '../../../application/use-cases/user/login-user.use-case';
import { ForgotPasswordUseCase } from '../../../application/use-cases/user/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../../application/use-cases/user/reset-password.use-case';
import { VerifyEmailUseCase } from '../../../application/use-cases/user/verify-email.use-case';
import { ResendVerificationUseCase } from '../../../application/use-cases/user/resend-verification.use-case';
import { IHashService } from '../../../domain/services/hash.service';
import { IJwtService } from '../../../application/services/jwt.service';
import { IRecaptchaService } from '../../../application/services/recaptcha.service';
import { AuthController } from '../controllers/auth.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validateRegisterBody } from '../../validators/register.validator';
import { validateLoginBody } from '../../validators/login.validator';
import { validateForgotPasswordBody } from '../../validators/forgot-password.validator';
import { validateResetPasswordBody } from '../../validators/reset-password.validator';
import { validateVerifyEmailQuery } from '../../validators/verify-email.validator';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { IGeocodingService } from '../../../application/services/geocoding.service';

export interface AuthRouterDeps {
  userRepo?: IUserRepository;
  passwordResetTokenRepo?: IPasswordResetTokenRepository;
  hashService?: IHashService;
  jwtService?: IJwtService;
  recaptchaService?: IRecaptchaService;
  geocodingService?: IGeocodingService;
  mailService?: IMailService;
}

export function createAuthRouter(deps: AuthRouterDeps = {}): Router {
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const passwordResetTokenRepo =
    deps.passwordResetTokenRepo ?? new PostgresPasswordResetTokenRepository(db);
  const hashService = deps.hashService ?? new Argon2HashService();
  const jwtService = deps.jwtService ?? new JwtService();
  const recaptchaService = deps.recaptchaService ?? new RecaptchaService();
  const geocodingService = deps.geocodingService ?? new NominatimAdapter();
  const mailService = deps.mailService ?? new ResendMailProvider();

  const registerUseCase = new RegisterUserUseCase(
    userRepo,
    hashService,
    jwtService,
    recaptchaService,
    geocodingService,
    mailService,
  );

  const loginUseCase = new LoginUserUseCase(userRepo, hashService, jwtService, recaptchaService);

  const forgotPasswordUseCase = new ForgotPasswordUseCase(
    userRepo,
    passwordResetTokenRepo,
    mailService,
  );

  const resetPasswordUseCase = new ResetPasswordUseCase(
    userRepo,
    passwordResetTokenRepo,
    hashService,
    mailService,
  );

  const verifyEmailUseCase = new VerifyEmailUseCase(userRepo);
  const resendVerificationUseCase = new ResendVerificationUseCase(userRepo, mailService);

  const controller = new AuthController(
    registerUseCase,
    loginUseCase,
    forgotPasswordUseCase,
    resetPasswordUseCase,
    verifyEmailUseCase,
    resendVerificationUseCase,
  );

  const router = Router();

  router.post('/register', validateRegisterBody, (req, res, next) =>
    controller.register(req, res, next),
  );

  router.post('/login', validateLoginBody, (req, res, next) => controller.login(req, res, next));

  router.post('/forgot-password', validateForgotPasswordBody, (req, res, next) =>
    controller.forgotPassword(req, res, next),
  );

  router.post('/reset-password', validateResetPasswordBody, (req, res, next) =>
    controller.resetPassword(req, res, next),
  );

  router.get('/verify-email', validateVerifyEmailQuery, (req, res, next) =>
    controller.verifyEmail(req, res, next),
  );

  const authSkipEmailVerify = createAuthMiddleware(jwtService, userRepo, {
    skipEmailVerification: true,
  });

  router.post('/resend-verification', authSkipEmailVerify, (req, res, next) =>
    controller.resendVerification(req, res, next),
  );

  return router;
}

export const authRouter = createAuthRouter();
