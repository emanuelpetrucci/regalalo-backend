import crypto from 'crypto';
import { AdminVerifyOtpRequest, AdminVerifyOtpResponse } from '../../../dtos/admin/auth/verify-otp.dto';
import { IAdminUserRepository } from '../../../../domain/repositories/admin-user.repository';
import { IAdminOtpTokenRepository } from '../../../../domain/repositories/admin-otp-token.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { IJwtService } from '../../../services/jwt.service';
import { AdminAuthException } from '../../../../domain/exceptions/admin-auth.exception';

const MAX_OTP_ATTEMPTS = 3;

export class AdminVerifyOtpUseCase {
  constructor(
    private readonly adminUserRepo: IAdminUserRepository,
    private readonly otpTokenRepo: IAdminOtpTokenRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
    private readonly adminJwtService: IJwtService,
  ) {}

  async execute(dto: AdminVerifyOtpRequest): Promise<AdminVerifyOtpResponse> {
    const admin = await this.adminUserRepo.findByEmail(dto.email.toLowerCase());
    if (!admin || !admin.isActive) {
      if (admin && !admin.isActive) {
        await this.otpTokenRepo.invalidateByAdminId(admin.id);
      }
      throw new AdminAuthException('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    const token = await this.otpTokenRepo.findActiveByAdminId(admin.id, true);
    if (!token || token.expiresAt < new Date()) {
      throw new AdminAuthException('OTP_EXPIRED', 'El código ha expirado');
    }

    const inputHash = crypto.createHash('sha256').update(dto.otp).digest('hex');
    const isCorrect = inputHash === token.tokenHash;

    if (!isCorrect) {
      const newAttempts = await this.otpTokenRepo.incrementAttempts(token.id);
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await this.otpTokenRepo.markUsed(token.id);
        throw new AdminAuthException('OTP_MAX_ATTEMPTS', 'Demasiados intentos fallidos');
      }
      throw new AdminAuthException('OTP_INVALID', 'Código incorrecto');
    }

    const newJwtVersion = await this.adminUserRepo.updateJwtVersion(admin.id);

    const jwtToken = this.adminJwtService.sign({
      sub: admin.id,
      role: 'admin',
      jwtVersion: newJwtVersion,
    });

    await this.otpTokenRepo.markUsed(token.id);
    await this.adminUserRepo.updateLastLogin(admin.id);

    await this.auditLogRepo.create({
      adminUserId: admin.id,
      action: 'admin.login',
      ipAddress: dto.ipAddress,
    });

    return {
      token: jwtToken,
      admin: { id: admin.id, email: admin.email },
    };
  }
}
