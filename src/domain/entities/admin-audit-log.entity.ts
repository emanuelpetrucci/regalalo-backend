export interface AdminAuditLog {
  id: string;
  adminUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payloadSnapshot: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}
