import '../registry';
import { z } from '../registry';
import { adminLoginBodySchema } from '../../interfaces/validators/admin-login.validator';
import { adminVerifyOtpBodySchema } from '../../interfaces/validators/admin-verify-otp.validator';
import { adminCorrectReputationBodySchema } from '../../interfaces/validators/admin-correct-reputation.validator';

export const adminLoginRequestSchema = adminLoginBodySchema.openapi('AdminLoginRequest');
export const adminVerifyOtpRequestSchema = adminVerifyOtpBodySchema.openapi('AdminVerifyOtpRequest');

export const adminLoginResponseSchema = z
  .object({ message: z.string() })
  .openapi('AdminLoginResponse');

export const adminVerifyOtpResponseSchema = z
  .object({
    token: z.string(),
    admin: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
    }),
  })
  .openapi('AdminVerifyOtpResponse');

export const adminErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .openapi('AdminError');

const adminUserListItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  reputationScore: z.number().int(),
  totalDonated: z.number().int(),
  totalReceived: z.number().int(),
  consecutiveNoShows: z.number().int(),
  cyclesAtLimit: z.number().int(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().nullable(),
  isPassive: z.boolean(),
  isHoarder: z.boolean(),
});

export const adminUserListResponseSchema = z
  .object({
    users: z.array(adminUserListItemSchema),
    pagination: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
  .openapi('AdminUserListResponse');

const adminReputationEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['delivery_completed', 'no_show', 'admin_correction']),
  delta: z.number().int(),
  sessionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const adminUserDetailResponseSchema = adminUserListItemSchema
  .extend({
    avatarUrl: z.string().url().nullable(),
    phone: z.string().nullable(),
    postalCode: z.string(),
    preferredLanguage: z.string(),
    reputationHistory: z.array(adminReputationEventSchema),
    activeItems: z.number().int(),
    completedItems: z.number().int(),
  })
  .openapi('AdminUserDetailResponse');

export const adminSuspendResponseSchema = z
  .object({ message: z.string(), itemsPaused: z.number().int() })
  .openapi('AdminSuspendResponse');

export const adminReactivateResponseSchema = z
  .object({ message: z.string(), itemsUnpaused: z.number().int() })
  .openapi('AdminReactivateResponse');

export const adminForceVerificationResponseSchema = z
  .object({ message: z.string() })
  .openapi('AdminForceVerificationResponse');

export const adminCorrectReputationRequestSchema =
  adminCorrectReputationBodySchema.openapi('AdminCorrectReputationRequest');

export const adminCorrectReputationResponseSchema = z
  .object({ newReputationScore: z.number().int(), delta: z.number().int() })
  .openapi('AdminCorrectReputationResponse');

export const adminResetNoShowsResponseSchema = z
  .object({ message: z.string(), previousValue: z.number().int() })
  .openapi('AdminResetNoShowsResponse');

const adminDonorSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
});

const adminItemListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  category: z.enum(['furniture', 'electronics', 'clothing', 'books', 'toys', 'kitchen', 'sports', 'tools', 'other']),
  weightRange: z.enum(['lt1', '1to5', '5to20', 'gt20']),
  status: z.enum(['active', 'reserved', 'completed', 'cancelled']),
  requestsPaused: z.boolean(),
  pausedByAdmin: z.boolean(),
  degradedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  donor: adminDonorSchema,
  requestCount: z.number().int(),
  images: z.array(z.string()),
});

export const adminItemListResponseSchema = z
  .object({
    items: z.array(adminItemListItemSchema),
    pagination: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
  .openapi('AdminItemListResponse');

const adminItemRequestDetailSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  createdAt: z.string().datetime(),
  requester: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    reputationScore: z.number().int(),
  }),
});

const adminActiveSessionDetailSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'reserved', 'completed', 'cancelled']),
  deadlineAt: z.string().datetime().nullable(),
  receiverId: z.string().uuid(),
});

export const adminItemDetailResponseSchema = adminItemListItemSchema
  .extend({
    digestNotifiedAt: z.string().datetime().nullable(),
    reservedAt: z.string().datetime().nullable(),
    requests: z.array(adminItemRequestDetailSchema),
    activeSession: adminActiveSessionDetailSchema.nullable(),
  })
  .openapi('AdminItemDetailResponse');

export const adminItemActionResponseSchema = z
  .object({ message: z.string() })
  .openapi('AdminItemActionResponse');

const adminSessionPartySchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
});

const adminSessionStatusEnum = z.enum(['active', 'completed', 'cancelled', 'expired']);

const adminSessionListItemSchema = z.object({
  id: z.string().uuid(),
  status: adminSessionStatusEnum,
  deadlineAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  contactPurged: z.boolean(),
  noShowDeclared: z.boolean(),
  item: z.object({ id: z.string().uuid(), title: z.string() }),
  donor: adminSessionPartySchema,
  receiver: adminSessionPartySchema,
});

export const adminSessionListResponseSchema = z
  .object({
    sessions: z.array(adminSessionListItemSchema),
    pagination: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
  .openapi('AdminSessionListResponse');

export const adminSessionDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: adminSessionStatusEnum,
    deadlineAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    donorConfirmed: z.boolean(),
    noShowDeclared: z.boolean(),
    contactChannel: z.string().nullable(),
    contactPurged: z.boolean(),
    item: z.object({
      id: z.string().uuid(),
      title: z.string(),
      category: z.enum(['furniture', 'electronics', 'clothing', 'books', 'toys', 'kitchen', 'sports', 'tools', 'other']),
    }),
    donor: adminSessionPartySchema,
    receiver: adminSessionPartySchema,
    auditLogged: z.boolean(),
  })
  .openapi('AdminSessionDetailResponse');

export const adminMetricsResponseSchema = z
  .object({
    users: z.object({
      total: z.number().int(),
      active: z.number().int(),
      suspended: z.number().int(),
      unverifiedOver24h: z.number().int(),
      passive: z.number().int(),
      hoarders: z.number().int(),
    }),
    items: z.object({
      active: z.number().int(),
      reserved: z.number().int(),
      completed: z.number().int(),
      cancelled: z.number().int(),
      degraded: z.number().int(),
    }),
    sessions: z.object({
      active: z.number().int(),
      completedLast30Days: z.number().int(),
      expiredLast30Days: z.number().int(),
      cancelledLast30Days: z.number().int(),
      noShowRate: z.number().nullable(),
    }),
    reports: z.object({
      pending: z.number().int(),
      resolvedLast30Days: z.number().int(),
      archivedLast30Days: z.number().int(),
    }),
  })
  .openapi('AdminMetricsResponse');

const adminCronJobInfoSchema = z.object({
  jobName: z.string(),
  lastRunAt: z.string().datetime().nullable(),
  lastStatus: z.enum(['succeeded', 'failed']).nullable(),
  returnMessage: z.string().nullable(),
});

const adminSystemAlertSchema = z.object({
  code: z.enum(['cron_job_failed', 'storage_queue_pending', 'unverified_users_24h']),
  severity: z.enum(['warn', 'danger']),
  title: z.string(),
  description: z.string(),
});

export const adminSystemHealthResponseSchema = z
  .object({
    cronJobs: z.array(adminCronJobInfoSchema),
    storageQueue: z.object({
      pendingDeletions: z.number().int(),
    }),
    unverifiedUsers24h: z.number().int(),
    alerts: z.array(adminSystemAlertSchema),
    storage: z.object({
      bucketName: z.string(),
      objectsStored: z.number().int().nullable(),
      usedBytes: z.number().int().nullable(),
      pendingDeletions: z.number().int(),
      cdnEnabled: z.boolean().nullable(),
    }),
    database: z.object({
      serverVersion: z.string().nullable(),
      engine: z.string().nullable(),
      activeConnections: z.number().int().nullable(),
      maxConnections: z.number().int().nullable(),
      sizeBytes: z.number().int().nullable(),
      lastBackupAt: z.string().datetime().nullable(),
      replicationActive: z.boolean().nullable(),
    }),
    generalConfig: z.object({
      appVersion: z.string().nullable(),
      environment: z.string(),
      publicAppUrl: z.string().url(),
      adminPanelUrl: z.string(),
      registrationOpen: z.boolean(),
      defaultSearchRadiusKm: z.number().int(),
      sessionDeadlineDays: z.number().int(),
      maxImagesPerItem: z.number().int(),
    }),
    stackVersions: z.object({
      node: z.string(),
      next: z.string().nullable(),
      react: z.string().nullable(),
      redis: z.string().nullable(),
      nginx: z.string().nullable(),
    }),
  })
  .openapi('AdminSystemHealthResponse');
