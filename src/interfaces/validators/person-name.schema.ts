import { z } from '../../zod';

export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be at most 50 characters')
  .regex(/^[\p{L}\p{M}'\-\s]+$/u, 'Name contains invalid characters');

export const optionalPhoneSchema = z.string().trim().min(1).max(20).optional();
