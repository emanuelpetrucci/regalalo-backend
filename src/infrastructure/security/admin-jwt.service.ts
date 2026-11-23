import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { IJwtService } from '../../application/services/jwt.service';

export class AdminJwtService implements IJwtService {
  sign(payload: Record<string, unknown>): string {
    return jwt.sign(payload, env.ADMIN_JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
  }

  verify(token: string): Record<string, unknown> {
    return jwt.verify(token, env.ADMIN_JWT_SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
  }
}
