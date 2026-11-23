import type { ReportReason } from '../../../domain/entities/report.entity.js';

export interface CreateReportRequestDto {
  reportedEntityType: 'item' | 'user';
  reportedEntityId: string;
  reason: ReportReason;
  description?: string;
  recaptchaToken: string;
}

export interface CreateReportResponseDto {
  id: string;
  message: string;
}
