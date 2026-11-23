export interface CreateAdminAuditLogInput {
  adminUserId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payloadSnapshot?: Record<string, unknown>;
  ipAddress: string;
}

export interface IAdminAuditLogRepository {
  create(input: CreateAdminAuditLogInput): Promise<void>;
}
