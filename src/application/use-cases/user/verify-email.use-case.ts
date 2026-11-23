import { createHash } from 'crypto';
import {
  VerifyEmailRequestDto,
  VerifyEmailResponseDto,
} from '../../dtos/email-verification.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

export class VerifyEmailUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: VerifyEmailRequestDto): Promise<VerifyEmailResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const user = await this.userRepo.findByVerificationTokenHash(tokenHash);
    if (!user) {
      throw new BadRequestException();
    }

    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt <= new Date()) {
      throw new BadRequestException();
    }

    await this.userRepo.markEmailVerified(user.id);

    return { message: 'Email verificado correctamente' };
  }
}
