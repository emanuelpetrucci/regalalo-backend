import '../registry';
import { z } from '../registry';
import {
  itemCategorySchema,
  itemConditionSchema,
  itemStatusSchema,
  itemWeightRangeSchema,
  paginationSchema,
} from './common.schemas';
import { publishItemBodySchema } from '../../interfaces/validators/publish-item.validator';
import { listItemsQuerySchema } from '../../interfaces/validators/list-items.validator';
import { pauseItemBodySchema } from '../../interfaces/validators/pause-item.validator';
import { selectReceiverBodySchema } from '../../interfaces/validators/select-receiver.validator';
import { requestItemBodySchema } from '../../interfaces/validators/request-item.validator';

export const listItemsQueryOpenApiSchema = listItemsQuerySchema.openapi('ListItemsQuery');
export const publishItemFieldsSchema = publishItemBodySchema.openapi('PublishItemFields');
export const pauseItemRequestSchema = pauseItemBodySchema.openapi('PauseItemRequest');
export const selectReceiverRequestSchema = selectReceiverBodySchema.openapi('SelectReceiverRequest');
export const requestItemRequestSchema = requestItemBodySchema.openapi('RequestItemRequest');

export const publishItemMultipartSchema = publishItemBodySchema
  .extend({
    images: z
      .array(z.string().openapi({ format: 'binary', type: 'string' }))
      .max(5)
      .optional(),
  })
  .openapi('PublishItemMultipart');

export const itemLookupParamSchema = z.string().openapi({
  param: { name: 'id', in: 'path' },
  description: 'UUID v4 del objeto o su slug',
  example: 'bicicleta-montana',
});

export const itemSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    condition: itemConditionSchema,
    category: itemCategorySchema,
    createdAt: z.string().datetime(),
    degradedAt: z.string().datetime().nullable(),
    distanceMeters: z.number().nullable(),
    locationName: z.string().nullable(),
    images: z.array(z.string().url()),
  })
  .openapi('ItemSummary');

export const listItemsResponseSchema = z
  .object({
    items: z.array(itemSummarySchema),
    pagination: paginationSchema,
  })
  .openapi('ListItemsResponse');

export const itemDonorSchema = z
  .object({
    id: z.string().uuid().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().url().nullable(),
    reputationScore: z.number().int(),
  })
  .openapi('ItemDonor');

export const getItemResponseSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    condition: itemConditionSchema,
    category: itemCategorySchema,
    weightRange: itemWeightRangeSchema,
    status: itemStatusSchema,
    requestsPaused: z.boolean(),
    degradedAt: z.string().datetime().nullable(),
    distanceMeters: z.number().nullable(),
    locationName: z.string().nullable(),
    images: z.array(z.string().url()),
    donor: itemDonorSchema,
    createdAt: z.string().datetime(),
  })
  .openapi('GetItemResponse');

export const publishItemResponseSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi('PublishItemResponse');

export const pauseItemResponseSchema = z
  .object({
    requestsPaused: z.boolean(),
  })
  .openapi('PauseItemResponse');

export const rankedCandidateSchema = z
  .object({
    requestId: z.string().uuid(),
    userId: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    reputationScore: z.number().int(),
    distanceMeters: z.number(),
    locationName: z.string().nullable(),
    requestDate: z.string().datetime(),
  })
  .openapi('RankedCandidate');

export const getRankedCandidatesResponseSchema = z
  .object({
    candidates: z.array(rankedCandidateSchema),
  })
  .openapi('GetRankedCandidatesResponse');

export const requestItemResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    status: z.literal('pending'),
    createdAt: z.string().datetime(),
  })
  .openapi('RequestItemResponse');

export const selectReceiverResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    status: z.literal('active'),
    deadlineAt: z.string().datetime(),
  })
  .openapi('SelectReceiverResponse');

export const cancelItemResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi('CancelItemResponse');
