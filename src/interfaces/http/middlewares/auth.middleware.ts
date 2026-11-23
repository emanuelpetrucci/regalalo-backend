import { Request, Response, NextFunction } from 'express';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { EmailNotVerifiedException } from '../../../domain/exceptions/email-not-verified.exception';

export interface AuthMiddlewareOptions {
  skipEmailVerification?: boolean;
}

// Story 8.5 will use { skipEmailVerification: true } for POST /auth/resend-verification
export function createAuthMiddleware(
  jwtService: IJwtService,
  userRepo: IUserRepository,
  options: AuthMiddlewareOptions = {},
) {
  return async function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException();
      }
      const token = authHeader.slice(7);

      let payload: Record<string, unknown>;
      try {
        payload = jwtService.verify(token);
      } catch {
        throw new UnauthorizedException();
      }

      const userId = payload['sub'];
      const jwtVersion = payload['jwtVersion'];
      if (typeof userId !== 'string' || typeof jwtVersion !== 'number') {
        throw new UnauthorizedException();
      }

      const user = await userRepo.findById(userId);
      if (!user) {
        throw new UnauthorizedException();
      }

      if (user.jwtVersion !== jwtVersion) {
        throw new UnauthorizedException();
      }

      if (!user.isActive) {
        throw new UnauthorizedException();
      }

      if (!options.skipEmailVerification && !user.emailVerified) {
        throw new EmailNotVerifiedException();
      }

      const { passwordHash: _, isActive: __, ...currentUser } = user;
      req.currentUser = currentUser;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createOptionalAuthMiddleware(
  jwtService: IJwtService,
  userRepo: IUserRepository,
  options: AuthMiddlewareOptions = {},
) {
  return async function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
      }
      const token = authHeader.slice(7);

      let payload: Record<string, unknown>;
      try {
        payload = jwtService.verify(token);
      } catch {
        throw new UnauthorizedException();
      }

      const userId = payload['sub'];
      const jwtVersion = payload['jwtVersion'];
      if (typeof userId !== 'string' || typeof jwtVersion !== 'number') {
        throw new UnauthorizedException();
      }

      const user = await userRepo.findById(userId);
      if (!user) {
        throw new UnauthorizedException();
      }

      if (user.jwtVersion !== jwtVersion) {
        throw new UnauthorizedException();
      }

      if (!user.isActive) {
        throw new UnauthorizedException();
      }

      if (!options.skipEmailVerification && !user.emailVerified) {
        throw new EmailNotVerifiedException();
      }

      const { passwordHash: _, isActive: __, ...currentUser } = user;
      req.currentUser = currentUser;
      next();
    } catch (err) {
      next(err);
    }
  };
}
