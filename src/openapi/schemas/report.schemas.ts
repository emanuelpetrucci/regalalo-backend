import '../registry';
import { z } from '../registry';
import { createReportBodySchema, reportReasonSchema } from '../../interfaces/validators/report.validator';

export const createReportRequestSchema = createReportBodySchema
  .extend({ reportedEntityId: z.string().uuid() })
  .openapi('CreateReportRequest');

export const createReportResponseSchema = z
  .object({
    id: z.string().uuid(),
    message: z.string(),
  })
  .openapi('CreateReportResponse');

const adminReportReporterSchema = z.object({
  id: z.string().uuid().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

const adminReportListItemSchema = z.object({
  id: z.string().uuid(),
  reportedEntityType: z.enum(['item', 'user']),
  reportedEntityId: z.string().uuid(),
  reason: reportReasonSchema,
  status: z.enum(['pending', 'resolved', 'archived']),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  entitySnapshot: z.record(z.string(), z.unknown()),
  reporter: adminReportReporterSchema,
  pendingCountForEntity: z.number().int(),
});

export const adminReportListResponseSchema = z
  .object({
    reports: z.array(adminReportListItemSchema),
    pagination: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
  .openapi('AdminReportListResponse');

const adminReportDetailReporterSchema = z.object({
  id: z.string().uuid().nullable(),
  email: z.string().email().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  reputationScore: z.number().int().nullable(),
  isActive: z.boolean().nullable(),
  totalReportsSubmitted: z.number().int(),
  totalReportsPending: z.number().int(),
}).nullable();

export const adminResolveReportRequestSchema = z
  .object({
    action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']).describe(
      'Acción de resolución. `cancel_item` solo válido para reportes de tipo `item`; '
      + '`warn_user` y `suspend_user` solo válidos para reportes de tipo `user`.',
    ),
    resolutionNote: z.string().min(1).max(1000),
  })
  .openapi('AdminResolveReportRequest');

export const adminResolveReportResponseSchema = z
  .object({
    message: z.string(),
    action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']),
    reportId: z.string().uuid(),
  })
  .openapi('AdminResolveReportResponse');

export const adminReportDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    reportedEntityType: z.enum(['item', 'user']),
    reportedEntityId: z.string().uuid(),
    reason: reportReasonSchema,
    description: z.string().nullable(),
    entitySnapshot: z.record(z.string(), z.unknown()),
    status: z.enum(['pending', 'resolved', 'archived']),
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
    resolvedBy: z.string().uuid().nullable(),
    resolutionAction: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']).nullable(),
    resolutionNote: z.string().nullable(),
    reporter: adminReportDetailReporterSchema,
    reportedEntity: z
      .object({
        type: z.enum(['item', 'user']),
        currentState: z.record(z.string(), z.unknown()).nullable(),
      })
      .nullable(),
  })
  .openapi('AdminReportDetailResponse');
