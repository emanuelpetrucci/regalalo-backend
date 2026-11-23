import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { IJwtService } from '../../application/services/jwt.service';

export class JwtService implements IJwtService {
  sign(payload: Record<string, unknown>): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  }

  verify(token: string): Record<string, unknown> {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
  }
}
