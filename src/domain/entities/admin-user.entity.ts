export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  jwtVersion: number;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}
