import { z } from '../registry';

export const nearbyItemsDigestResponseSchema = z.object({
  processedItems: z.number().int().nonnegative(),
  recipientsNotified: z.number().int().nonnegative(),
  emailsSent: z.number().int().nonnegative(),
  emailsFailed: z.number().int().nonnegative(),
  executionMs: z.number().int().nonnegative(),
});
