import { createHash } from 'crypto';
import { logger } from '../../../infrastructure/logging/logger';
import { ResetPasswordRequestDto, ResetPasswordResponseDto } from '../../dtos/password-reset.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IPasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { IHashService } from '../../../domain/services/hash.service';
import { IMailService } from '../../../domain/services/mail.service';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

export class ResetPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly hashService: IHashService,
    private readonly mailService: IMailService,
  ) {}

  async execute(dto: ResetPasswordRequestDto): Promise<ResetPasswordResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const tokenRecord = await this.tokenRepo.findByTokenHash(tokenHash);
    if (!tokenRecord || tokenRecord.used || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException();
    }

    const user = await this.userRepo.findById(tokenRecord.userId);
    if (!user) throw new BadRequestException();

    const newPasswordHash = await this.hashService.hash(dto.newPassword);

    await this.tokenRepo.markUsedAndResetUserPassword(
      tokenRecord.id,
      tokenRecord.userId,
      newPasswordHash,
    );

    this.mailService
      .send({
        to: user.email,
        templateId: 'TPL-008',
        variables: { recipientEmail: user.email, firstName: user.firstName },
        language: user.preferredLanguage,
      })
      .catch((err) => logger.error({ err }, 'Failed to send password reset confirmation email'));

    return { message: 'Contraseña restablecida correctamente.' };
  }
}
