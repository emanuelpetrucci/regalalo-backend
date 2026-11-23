import type {
  Report,
  ReportEntityType,
  ReportReason,
  ReportStatus,
  ResolutionAction,
  EntitySnapshot,
} from '../entities/report.entity.js';

export interface CreateReportInput {
  reporterId: string;
  reportedEntityType: ReportEntityType;
  reportedEntityId: string;
  reason: ReportReason;
  description: string | null;
  entitySnapshot: EntitySnapshot;
}

export interface AdminReportQuery {
  status?: ReportStatus;
  reportedEntityType?: ReportEntityType;
  reason?: ReportReason;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
}

export interface AdminReportRecord {
  id: string;
  reportedEntityType: ReportEntityType;
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

export interface AdminReportDetailRecord {
  id: string;
  reportedEntityType: ReportEntityType;
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
    preferredLanguage: string | null;
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

export interface UpdateReportInput {
  status: ReportStatus;
  resolvedAt: Date;
  resolvedBy: string;
  resolutionAction: ResolutionAction;
  resolutionNote: string;
}

export interface IReportRepository {
  create(input: CreateReportInput): Promise<Report>;
  findAllAdmin(query: AdminReportQuery): Promise<{ reports: AdminReportRecord[]; total: number }>;
  findByIdAdmin(id: string): Promise<AdminReportDetailRecord | null>;
  update(id: string, input: UpdateReportInput): Promise<Report>;
  countByReporterAndEntity(reporterId: string, entityId: string, entityType: ReportEntityType, since: Date): Promise<number>;
  countByReporterSince(reporterId: string, since: Date): Promise<number>;
  hasPendingByReporterAndEntity(reporterId: string, entityId: string, entityType: ReportEntityType): Promise<boolean>;
  countMetrics(): Promise<{ pending: number; resolvedLast30Days: number; archivedLast30Days: number }>;
}
