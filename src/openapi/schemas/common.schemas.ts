import '../registry';
import { z } from '../registry';

export const uuidParamSchema = z.string().uuid().openapi({
  param: { name: 'id', in: 'path' },
  example: '550e8400-e29b-41d4-a716-446655440000',
});

export const requestIdParamSchema = z.string().uuid().openapi({
  param: { name: 'requestId', in: 'path' },
  example: '660e8400-e29b-41d4-a716-446655440001',
});

export const errorSchema = z.object({ message: z.string() }).openapi('Error');

export const validationErrorSchema = z
  .object({
    message: z.string(),
    errors: z.array(z.unknown()).optional(),
  })
  .openapi('ValidationError');

export const paginationSchema = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .openapi('Pagination');

export const itemConditionSchema = z.enum(['new', 'like_new', 'good', 'fair']);

export const itemCategorySchema = z.enum([
  'furniture',
  'electronics',
  'clothing',
  'books',
  'toys',
  'kitchen',
  'sports',
  'tools',
  'other',
]);

export const itemWeightRangeSchema = z.enum(['lt1', '1to5', '5to20', 'gt20']);

export const itemStatusSchema = z.enum(['active', 'reserved', 'completed', 'cancelled']);

export const deliverySessionStatusSchema = z.enum([
  'active',
  'completed',
  'cancelled',
  'expired',
]);

export const requestStatusSchema = z.enum(['pending', 'selected', 'rejected', 'cancelled']);
