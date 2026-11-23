import { IReportRepository } from '../../../domain/repositories/report.repository.js';
import { IRecaptchaService } from '../../services/recaptcha.service.js';
import { IMailService } from '../../../domain/services/mail.service.js';
import type { AppPreferredLanguage } from '../../../interfaces/validators/preferred-language.schema.js';
import { ItemReadService } from '../../services/item-read.service.js';
import { isRecaptchaPassed } from '../../services/recaptcha-policy.js';
import { safeEmitEvent } from '../../services/analytics.service.js';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception.js';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception.js';
import { ConflictException } from '../../../domain/exceptions/conflict.exception.js';
import { UnprocessableEntityException } from '../../../domain/exceptions/unprocessable-entity.exception.js';
import { TooManyRequestsException } from '../../../domain/exceptions/too-many-requests.exception.js';
import { CreateReportRequestDto, CreateReportResponseDto } from '../../dtos/report/create-report.dto.js';
import { EntitySnapshot } from '../../../domain/entities/report.entity.js';
import { appLogger } from '../../../config/loggers.js';
import { env } from '../../../config/env.js';

export class CreateReportUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly itemReadService: ItemReadService,
    private readonly recaptchaService: IRecaptchaService,
    private readonly mailService: IMailService,
  ) {}

  async execute(
    dto: CreateReportRequestDto,
    reporterId: string,
    reporterEmail: string,
    reporterLanguage?: AppPreferredLanguage,
  ): Promise<CreateReportResponseDto> {
    // 1. Validar reCAPTCHA
    const captcha = await this.recaptchaService.verify(dto.recaptchaToken).catch(() => {
      throw new BadRequestException('RECAPTCHA_UNAVAILABLE');
    });
    if (!isRecaptchaPassed(captcha)) {
      throw new BadRequestException('RECAPTCHA_FAILED');
    }

    // 2. Leer entidad reportada y verificar auto-reporte y reportabilidad
    let entitySnapshot: EntitySnapshot;

    if (dto.reportedEntityType === 'item') {
      const item = await this.itemReadService.getItemForReport(dto.reportedEntityId);
      if (!item) throw new NotFoundException('ENTITY_NOT_FOUND');
      if (item.donorId === reporterId) throw new UnprocessableEntityException('SELF_REPORT_FORBIDDEN');
      if (item.status === 'cancelled') throw new UnprocessableEntityException('ENTITY_NOT_REPORTABLE');
      entitySnapshot = {
        entityType: 'item',
        title: item.title,
        status: item.status,
        category: item.category,
        description: [...item.description].slice(0, 300).join(''),
      };
    } else {
      const user = await this.itemReadService.getUserForReport(dto.reportedEntityId);
      if (!user) throw new NotFoundException('ENTITY_NOT_FOUND');
      if (dto.reportedEntityId === reporterId) throw new UnprocessableEntityException('SELF_REPORT_FORBIDDEN');
      entitySnapshot = {
        entityType: 'user',
        firstName: user.firstName,
        lastName: user.lastName,
        reputationScore: user.reputationScore,
      };
    }

    // 3. Verificar duplicado activo
    const hasPending = await this.reportRepo.hasPendingByReporterAndEntity(reporterId, dto.reportedEntityId, dto.reportedEntityType);
    if (hasPending) throw new ConflictException('REPORT_ALREADY_PENDING');

    // 4. Verificar límite por entidad (3 en 24h)
    const sub24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const countByEntity = await this.reportRepo.countByReporterAndEntity(reporterId, dto.reportedEntityId, dto.reportedEntityType, sub24h);
    if (countByEntity >= 3) throw new TooManyRequestsException('RATE_LIMIT_ENTITY_EXCEEDED', 86400);

    // 5. Verificar límite total (10 en 7 días)
    const sub7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const countTotal = await this.reportRepo.countByReporterSince(reporterId, sub7d);
    if (countTotal >= 10) throw new TooManyRequestsException('RATE_LIMIT_TOTAL_EXCEEDED', 604800);

    // 6. Crear reporte
    const report = await this.reportRepo.create({
      reporterId,
      reportedEntityType: dto.reportedEntityType,
      reportedEntityId: dto.reportedEntityId,
      reason: dto.reason,
      description: dto.description ?? null,
      entitySnapshot,
    });

    // 7. Post-commit fire-and-forget: emails + analítica
    void Promise.all([
      this.mailService
        .send({
          to: reporterEmail,
          templateId: 'TPL-011',
          variables: {
            reportId: report.id,
            reportedEntityType: dto.reportedEntityType,
            reason: dto.reason,
          },
          language: reporterLanguage,
        })
        .catch((err) => appLogger.error({ err }, 'TPL-011 email failed')),
      this.mailService
        .send({
          to: env.ADMIN_EMAIL,
          templateId: 'TPL-ADM-002',
          variables: { reportId: report.id, entityType: dto.reportedEntityType, reason: dto.reason },
        })
        .catch((err) => appLogger.error({ err }, 'TPL-ADM-002 email failed')),
      Promise.resolve(
        safeEmitEvent('report.submitted', reporterId, {
          entityType: dto.reportedEntityType,
          reason: dto.reason,
        }),
      ).catch((err) => appLogger.error({ err }, 'AE-032 analytics failed')),
    ]);

    return {
      id: report.id,
      message: 'Reporte enviado correctamente. Lo revisaremos lo antes posible.',
    };
  }
}
