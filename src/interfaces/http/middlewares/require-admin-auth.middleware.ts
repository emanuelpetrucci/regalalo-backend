import { Request, Response, NextFunction } from 'express';
import { IJwtService } from '../../../application/services/jwt.service';
import { IAdminUserRepository } from '../../../domain/repositories/admin-user.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

export function createRequireAdminAuthMiddleware(
  adminJwtService: IJwtService,
  adminUserRepo: IAdminUserRepository,
) {
  return async function requireAdminAuth(
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
        payload = adminJwtService.verify(token);
      } catch {
        throw new UnauthorizedException();
      }

      const adminId = payload['sub'];
      const jwtVersion = payload['jwtVersion'];
      const role = payload['role'];

      if (
        typeof adminId !== 'string' ||
        typeof jwtVersion !== 'number' ||
        role !== 'admin'
      ) {
        throw new UnauthorizedException();
      }

      const admin = await adminUserRepo.findById(adminId);
      if (!admin) {
        throw new UnauthorizedException();
      }

      if (admin.jwtVersion !== jwtVersion) {
        throw new UnauthorizedException();
      }

      if (!admin.isActive) {
        throw new UnauthorizedException();
      }

      const { passwordHash: _, isActive: __, ...adminUser } = admin;
      req.adminUser = adminUser;
      next();
    } catch (err) {
      next(err);
    }
  };
}
