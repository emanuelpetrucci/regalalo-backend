import type {
  ReportReason,
  ReportStatus,
  ResolutionAction,
  EntitySnapshot,
} from '../../../domain/entities/report.entity.js';

export interface ReportDetailResponseDto {
  id: string;
  reportedEntityType: 'item' | 'user';
  reportedEntityId: string;
  reason: ReportReason;
  description: string | null;
  entitySnapshot: EntitySnapshot;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionAction: ResolutionAction | null;
  resolutionNote: string | null;
  reporter: {
    id: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    reputationScore: number | null;
    isActive: boolean | null;
    totalReportsSubmitted: number;
    totalReportsPending: number;
  } | null;
  reportedEntity: {
    type: 'item' | 'user';
    currentState: Record<string, unknown> | null;
  } | null;
}
