import '../registry';
import { z } from '../registry';
import {
  deliverySessionStatusSchema,
  itemCategorySchema,
  itemConditionSchema,
  itemStatusSchema,
  paginationSchema,
  requestStatusSchema,
} from './common.schemas';
import { listMyItemsQuerySchema } from '../../interfaces/validators/list-my-items.validator';
import { listMyRequestsQuerySchema } from '../../interfaces/validators/list-my-requests.validator';
import { listMyDeliverySessionsQuerySchema } from '../../interfaces/validators/list-my-delivery-sessions.validator';
import { updateProfileBodySchema } from '../../interfaces/validators/update-profile.validator';
import { personNameSchema } from '../../interfaces/validators/person-name.schema';

export const listMyItemsQueryOpenApiSchema = listMyItemsQuerySchema.openapi('ListMyItemsQuery');
export const listMyRequestsQueryOpenApiSchema =
  listMyRequestsQuerySchema.openapi('ListMyRequestsQuery');
export const listMyDeliverySessionsQueryOpenApiSchema =
  listMyDeliverySessionsQuerySchema.openapi('ListMyDeliverySessionsQuery');

export const privateProfileSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().url().nullable(),
    phone: z.string().nullable(),
    postalCode: z.string(),
    preferredLanguage: z.string(),
    emailVerified: z.boolean(),
    reputationScore: z.number().int(),
    totalReceived: z.number().int(),
    totalDonated: z.number().int(),
    consecutiveNoShows: z.number().int(),
    createdAt: z.string().datetime(),
  })
  .openapi('PrivateProfile');

export const publicProfileSchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().nullable(),
    reputationScore: z.number().int(),
    totalReceived: z.number().int(),
    totalDonated: z.number().int(),
    createdAt: z.string().datetime(),
  })
  .openapi('PublicProfile');

export const reputationEventSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['delivery_completed', 'no_show']),
    delta: z.number().int(),
    sessionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('ReputationEvent');

export const reputationHistoryResponseSchema = z
  .object({
    events: z.array(reputationEventSchema),
  })
  .openapi('ReputationHistoryResponse');

export const myItemSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    category: itemCategorySchema,
    condition: itemConditionSchema,
    status: itemStatusSchema,
    requestsPaused: z.boolean(),
    degradedAt: z.string().datetime().nullable(),
    images: z.array(z.string().url()),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    requestCount: z.number().int().min(0),
  })
  .openapi('MyItem');

export const myItemsResponseSchema = z
  .object({
    items: z.array(myItemSchema),
    pagination: paginationSchema,
  })
  .openapi('MyItemsResponse');

export const myRequestSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    itemTitle: z.string(),
    itemStatus: itemStatusSchema,
    status: requestStatusSchema,
    images: z.array(z.string().url()),
    createdAt: z.string().datetime(),
  })
  .openapi('MyRequest');

export const myRequestsResponseSchema = z
  .object({
    requests: z.array(myRequestSchema),
    pagination: paginationSchema,
  })
  .openapi('MyRequestsResponse');

export const myDeliverySessionSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    itemTitle: z.string(),
    itemImageUrl: z.string().url().nullable(),
    role: z.enum(['donor', 'receiver']),
    status: deliverySessionStatusSchema,
    deadlineAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    otherPartyUserId: z.string().uuid(),
    otherPartyFirstName: z.string(),
    otherPartyLastName: z.string(),
    otherPartyAvatarUrl: z.string().url().nullable(),
  })
  .openapi('MyDeliverySession');

export const myDeliverySessionsResponseSchema = z
  .object({
    sessions: z.array(myDeliverySessionSchema),
    pagination: paginationSchema,
  })
  .openapi('MyDeliverySessionsResponse');

export const updateProfileRequestSchema = updateProfileBodySchema.openapi('UpdateProfileRequest');

export const updateProfileResponseSchema = z
  .object({
    id: z.string().uuid(),
    firstName: personNameSchema,
    lastName: personNameSchema,
    avatarUrl: z.string().url().nullable(),
    phone: z.string().nullable(),
    postalCode: z.string(),
    preferredLanguage: z.string(),
  })
  .openapi('UpdateProfileResponse');
