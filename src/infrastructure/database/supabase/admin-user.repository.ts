import { Pool } from 'pg';
import { AdminUser } from '../../../domain/entities/admin-user.entity';
import { IAdminUserRepository } from '../../../domain/repositories/admin-user.repository';

type AdminUserDbRow = {
  id: string;
  email: string;
  password_hash: string;
  jwt_version: number;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
};

const ADMIN_USER_SELECT = 'id, email, password_hash, jwt_version, is_active, last_login_at, created_at';

export class PostgresAdminUserRepository implements IAdminUserRepository {
  constructor(private readonly db: Pool) {}

  async findByEmail(email: string): Promise<AdminUser | null> {
    const result = await this.db.query<AdminUserDbRow>(
      `SELECT ${ADMIN_USER_SELECT} FROM admin_users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<AdminUser | null> {
    const result = await this.db.query<AdminUserDbRow>(
      `SELECT ${ADMIN_USER_SELECT} FROM admin_users WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db.query(
      `UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async updateJwtVersion(id: string): Promise<number> {
    const result = await this.db.query<{ jwt_version: number }>(
      `UPDATE admin_users SET jwt_version = jwt_version + 1 WHERE id = $1 RETURNING jwt_version`,
      [id],
    );
    return result.rows[0]?.jwt_version ?? 0;
  }

  private mapRow(row: AdminUserDbRow): AdminUser {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      jwtVersion: row.jwt_version,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    };
  }
}
