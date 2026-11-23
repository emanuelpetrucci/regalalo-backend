import { randomBytes, createHash } from 'crypto';
import { env } from '../../../config/env';
import { logger } from '../../../infrastructure/logging/logger';
import { ForgotPasswordRequestDto, ForgotPasswordResponseDto } from '../../dtos/password-reset.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { IMailService } from '../../../domain/services/mail.service';

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(dto: ForgotPasswordRequestDto): Promise<ForgotPasswordResponseDto> {
    const normalizedEmail = dto.email.toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (user) {
      await this.tokenRepo.deleteActiveByUserId(user.id);

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.tokenRepo.create({ userId: user.id, tokenHash, expiresAt });

      const resetLink = `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`;
      this.mailService
        .send({
          to: user.email,
          templateId: 'TPL-002',
          variables: {
            recipientEmail: user.email,
            firstName: user.firstName,
            resetLink,
            expiresInMinutes: 60,
          },
          language: user.preferredLanguage,
        })
        .catch((err) => logger.error({ err }, 'Failed to send password reset email'));
    }

    return { message: 'Si el email existe, recibirás un enlace de recuperación.' };
  }
}
