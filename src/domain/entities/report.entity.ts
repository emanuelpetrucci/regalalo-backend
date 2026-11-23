export type ReportEntityType = 'item' | 'user';

export const REPORT_REASONS = [
  'contenido_inadecuado',
  'fraude_o_enganio',
  'spam',
  'objeto_ilegal',
  'objeto_peligroso',
  'información_falsa',
  'comportamiento_abusivo',
  'otro',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportStatus = 'pending' | 'resolved' | 'archived';

export type ResolutionAction = 'archive' | 'warn_user' | 'cancel_item' | 'suspend_user';

export interface ItemSnapshot {
  entityType: 'item';
  title: string;
  status: string;
  category: string;
  description: string;
}

export interface UserSnapshot {
  entityType: 'user';
  firstName: string;
  lastName: string;
  reputationScore: number;
}

export type EntitySnapshot = ItemSnapshot | UserSnapshot;

export interface Report {
  id: string;
  reporterId: string | null;
  reportedEntityType: ReportEntityType;
  reportedEntityId: string;
  reason: ReportReason;
  description: string | null;
  entitySnapshot: EntitySnapshot;
  status: ReportStatus;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionAction: ResolutionAction | null;
  resolutionNote: string | null;
  createdAt: Date;
}
