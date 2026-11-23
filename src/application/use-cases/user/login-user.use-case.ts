import { env } from '../../../config/env';
import { logger } from '../../../infrastructure/logging/logger';
import { LoginRequestDto, LoginResponseDto } from '../../dtos/auth.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IHashService } from '../../../domain/services/hash.service';
import { IJwtService } from '../../services/jwt.service';
import { IRecaptchaService } from '../../services/recaptcha.service';
import { isRecaptchaPassed, recaptchaMinScore } from '../../services/recaptcha-policy';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { UnprocessableEntityException } from '../../../domain/exceptions/unprocessable-entity.exception';
import { emitEvent } from '../../services/analytics.service';

export class LoginUserUseCase {
  private static readonly SENTINEL_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$c2VudGluZWxzYWx0c2VudA$sentinelhashoutputsentinelhashout';

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hashService: IHashService,
    private readonly jwtService: IJwtService,
    private readonly recaptchaService: IRecaptchaService,
  ) {}

  async execute(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const captcha = await this.recaptchaService.verify(dto.recaptchaToken);
    if (!isRecaptchaPassed(captcha)) {
      if (env.NODE_ENV !== 'production') {
        logger.warn(
          { score: captcha.score, minScore: recaptchaMinScore, success: captcha.success },
          'reCAPTCHA rechazado (p. ej. incógnito suele bajar el score)',
        );
      }
      throw new UnprocessableEntityException();
    }

    const normalizedEmail = dto.email.toLowerCase();

    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      // Dummy verify to equalize timing and prevent user enumeration via side-channel
      await this.hashService.verify(LoginUserUseCase.SENTINEL_HASH, dto.password);
      logger.warn('Login attempt for unknown email');
      throw new UnauthorizedException();
    }

    if (!user.passwordHash) {
      logger.warn({ userId: user.id }, 'Login attempt on account without password');
      throw new UnauthorizedException();
    }

    const valid = await this.hashService.verify(user.passwordHash, dto.password);
    if (!valid) {
      logger.warn({ userId: user.id }, 'Login attempt with invalid password');
      throw new UnauthorizedException();
    }

    const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

    emitEvent('user.login', user.id, {});

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        reputationScore: user.reputationScore,
      },
    };
  }
}
