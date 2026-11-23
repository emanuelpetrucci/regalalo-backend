import { randomBytes, createHash } from 'crypto';
import { logger } from '../../../infrastructure/logging/logger';
import { env } from '../../../config/env';
import { RegisterRequestDto, AuthResponseDto } from '../../dtos/auth.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { IHashService } from '../../../domain/services/hash.service';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { GeocodingException } from '../../../domain/exceptions/geocoding.exception';
import { UnprocessableEntityException } from '../../../domain/exceptions/unprocessable-entity.exception';
import { IGeocodingService } from '../../services/geocoding.service';
import { IJwtService } from '../../services/jwt.service';
import { IRecaptchaService } from '../../services/recaptcha.service';
import { isRecaptchaPassed, recaptchaMinScore } from '../../services/recaptcha-policy';
import { emitEvent } from '../../services/analytics.service';

export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hashService: IHashService,
    private readonly jwtService: IJwtService,
    private readonly recaptchaService: IRecaptchaService,
    private readonly geocodingService: IGeocodingService,
    private readonly mailService: IMailService,
  ) {}

  async execute(dto: RegisterRequestDto): Promise<AuthResponseDto> {
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
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) throw new ConflictException();

    const passwordHash = await this.hashService.hash(dto.password);

    const coords = await this.geocodingService.geocode(dto.postalCode);
    if (!coords) throw new GeocodingException('Código postal no válido o no encontrado');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const verificationResendAt = new Date();

    const user = await this.userRepo.create({
      email: normalizedEmail,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      postalCode: dto.postalCode,
      locationName: coords.locationName,
      lat: coords.lat,
      lon: coords.lon,
      verificationTokenHash: tokenHash,
      verificationTokenExpiresAt,
      verificationResendAt,
      preferredLanguage: dto.language,
    });

    const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

    emitEvent('user.registered', user.id, { postalCode: user.postalCode });

    const verificationLink = `${env.APP_PUBLIC_URL}/verificar-email?token=${rawToken}`;

    this.mailService
      .send({
        to: user.email,
        templateId: 'TPL-009',
        variables: {
          recipientEmail: user.email,
          firstName: user.firstName,
          verificationLink,
          expiresInHours: 24,
        },
        language: user.preferredLanguage,
      })
      .catch((err) => logger.error({ err }, 'Failed to send email verification email'));

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        postalCode: user.postalCode,
        reputationScore: user.reputationScore,
        totalReceived: user.totalReceived,
        totalDonated: user.totalDonated,
      },
    };
  }
}
