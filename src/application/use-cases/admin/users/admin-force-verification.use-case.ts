import { randomBytes, createHash } from 'crypto';
import { logger } from '../../../../infrastructure/logging/logger';
import { env } from '../../../../config/env';
import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { IMailService } from '../../../../domain/services/mail.service';
import { AdminForceVerificationResponse } from '../../../dtos/admin/admin-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

const EXPIRES_HOURS = 24;

export class AdminForceVerificationUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(
    adminUserId: string,
    userId: string,
    ipAddress: string,
  ): Promise<AdminForceVerificationResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException();
    if (user.emailVerified) throw new ConflictException('Email ya verificado');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000);

    await this.userRepo.adminForceVerification(userId, tokenHash, expiresAt);

    const verificationLink = `${env.APP_PUBLIC_URL}/verificar-email?token=${rawToken}`;
    this.mailService
      .send({
        to: user.email,
        templateId: 'TPL-009',
        variables: {
          recipientEmail: user.email,
          firstName: user.firstName,
          verificationLink,
          expiresInHours: EXPIRES_HOURS,
        },
      })
      .catch((err) => logger.error({ err }, 'Failed to send admin force verification email'));

    await this.auditLogRepo.create({
      adminUserId,
      action: 'user.verification_forced',
      entityType: 'user',
      entityId: userId,
      payloadSnapshot: { email_verified: user.emailVerified },
      ipAddress,
    });

    return { message: 'Email de verificación enviado' };
  }
}
