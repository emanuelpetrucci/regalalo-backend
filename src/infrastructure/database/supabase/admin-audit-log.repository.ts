import { Pool } from 'pg';
import {
  IAdminAuditLogRepository,
  CreateAdminAuditLogInput,
} from '../../../domain/repositories/admin-audit-log.repository';

export class PostgresAdminAuditLogRepository implements IAdminAuditLogRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateAdminAuditLogInput): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, entity_type, entity_id, payload_snapshot, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.adminUserId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.payloadSnapshot ?? {}),
        input.ipAddress,
      ],
    );
  }
}
