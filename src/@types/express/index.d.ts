import { User } from '../../domain/entities/user.entity';
import { AdminUser } from '../../domain/entities/admin-user.entity';

declare module 'express-serve-static-core' {
  interface Request {
    currentUser?: Omit<User, 'passwordHash' | 'isActive'>;
    adminUser?: Omit<AdminUser, 'passwordHash' | 'isActive'>;
  }
}
