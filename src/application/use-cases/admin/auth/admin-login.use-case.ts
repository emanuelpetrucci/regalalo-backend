import crypto from 'crypto';
import { AdminLoginRequest, AdminLoginResponse } from '../../../dtos/admin/auth/login.dto';
import { IAdminUserRepository } from '../../../../domain/repositories/admin-user.repository';
import { IAdminOtpTokenRepository } from '../../../../domain/repositories/admin-otp-token.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { IHashService } from '../../../../domain/services/hash.service';
import { IMailService } from '../../../../domain/services/mail.service';
import { AdminAuthException } from '../../../../domain/exceptions/admin-auth.exception';

export const OTP_EXPIRY_MINUTES = 10;

const SENTINEL_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudGluZWxzYWx0c2VudA$c2VudGluZWxwYXNzd29yZGFiY2RlZmdoaWp';

export class AdminLoginUseCase {
  constructor(
    private readonly adminUserRepo: IAdminUserRepository,
    private readonly hashService: IHashService,
    private readonly otpTokenRepo: IAdminOtpTokenRepository,
    private readonly mailService: IMailService,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(dto: AdminLoginRequest): Promise<AdminLoginResponse> {
    const admin = await this.adminUserRepo.findByEmail(dto.email.toLowerCase());

    if (!admin || !admin.isActive) {
      try {
        await this.hashService.verify(SENTINEL_HASH, dto.password);
      } catch {
        // Sentinel must never propagate — swallow to keep 401 response
      }
      throw new AdminAuthException('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    const valid = await this.hashService.verify(admin.passwordHash, dto.password);
    if (!valid) {
      throw new AdminAuthException('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    await this.otpTokenRepo.invalidateByAdminId(admin.id);

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.mailService.send({
      to: admin.email,
      templateId: 'TPL-ADM-001',
      variables: { otp: otpCode, expiresInMinutes: OTP_EXPIRY_MINUTES },
    });

    await this.otpTokenRepo.create({
      adminUserId: admin.id,
      tokenHash,
      expiresAt,
    });

    await this.auditLogRepo.create({
      adminUserId: admin.id,
      action: 'admin.otp_requested',
      ipAddress: dto.ipAddress,
    });

    return { message: 'Código enviado al email registrado' };
  }
}
