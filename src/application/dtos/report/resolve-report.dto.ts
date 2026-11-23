import type { ResolutionAction } from '../../../domain/entities/report.entity.js';

export interface ResolveReportRequestDto {
  action: ResolutionAction;
  resolutionNote: string;
}

export interface ResolveReportResponseDto {
  message: string;
  action: ResolutionAction;
  reportId: string;
}
