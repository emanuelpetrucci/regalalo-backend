import { randomBytes, createHash } from 'crypto';
import { logger } from '../../../infrastructure/logging/logger';
import { env } from '../../../config/env';
import { ResendVerificationResponseDto } from '../../dtos/email-verification.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { ResendCooldownException } from '../../../domain/exceptions/resend-cooldown.exception';

const COOLDOWN_MS = 30_000;
const EXPIRES_HOURS = 24;

export class ResendVerificationUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(userId: string): Promise<ResendVerificationResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (user.emailVerified) throw new ConflictException('Email already verified');

    if (user.verificationResendAt) {
      const elapsed = Date.now() - user.verificationResendAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        throw new ResendCooldownException((COOLDOWN_MS - elapsed) / 1000);
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000);
    const resendAt = new Date();

    await this.userRepo.updateVerificationToken({ userId: user.id, tokenHash, expiresAt, resendAt });

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
        language: user.preferredLanguage,
      })
      .catch((err) => logger.error({ err }, 'Failed to send verification email'));

    return { message: 'Email de verificación reenviado' };
  }
}
