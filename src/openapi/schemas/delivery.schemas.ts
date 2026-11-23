import '../registry';
import { z } from '../registry';
import {
  deliverySessionStatusSchema,
  itemCategorySchema,
  itemConditionSchema,
} from './common.schemas';
import { cancelDeliveryBodySchema } from '../../interfaces/validators/cancel-delivery.validator';

export const cancelDeliveryRequestSchema = cancelDeliveryBodySchema.openapi('CancelDeliveryRequest');

export const deliverySessionItemSummarySchema = z
  .object({
    title: z.string(),
    condition: itemConditionSchema,
    category: itemCategorySchema,
    images: z.array(z.string().url()),
  })
  .openapi('DeliverySessionItemSummary');

export const deliverySessionOtherPartySchema = z
  .object({
    userId: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().url().nullable(),
    reputationScore: z.number(),
    distanceMeters: z.number().int(),
    locationName: z.string().nullable(),
  })
  .openapi('DeliverySessionOtherParty');

export const deliverySessionSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    status: deliverySessionStatusSchema,
    contactChannel: z.string().nullable(),
    sharedContactChannel: z.string().nullable(),
    receiverContactChannel: z.string().nullable(),
    deadlineAt: z.string().datetime(),
    donorConfirmed: z.boolean(),
    noShowDeclared: z.boolean(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    role: z.enum(['donor', 'receiver']),
    item: deliverySessionItemSummarySchema,
    otherParty: deliverySessionOtherPartySchema,
  })
  .openapi('DeliverySession');

export const confirmDeliveryResponseSchema = z
  .object({
    status: z.literal('completed'),
    completedAt: z.string(),
  })
  .openapi('ConfirmDeliveryResponse');

export const cancelDeliveryResponseSchema = z
  .object({
    status: z.literal('cancelled'),
    noShowDeclared: z.boolean(),
    completedAt: z.string().datetime(),
  })
  .openapi('CancelDeliveryResponse');
