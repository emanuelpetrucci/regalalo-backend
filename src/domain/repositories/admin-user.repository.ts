import { AdminUser } from '../entities/admin-user.entity';

export interface IAdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  updateLastLogin(id: string): Promise<void>;
  updateJwtVersion(id: string): Promise<number>;
}
