import type { ReportReason, ReportStatus, EntitySnapshot } from '../../../domain/entities/report.entity.js';

export interface ReportListItemDto {
  id: string;
  reportedEntityType: 'item' | 'user';
  reportedEntityId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  entitySnapshot: EntitySnapshot;
  reporter: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  pendingCountForEntity: number;
}

export interface ReportListResponseDto {
  reports: ReportListItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
