import { z } from 'zod';

export const decisionSchema = z.object({
  actionType: z.string().min(1),
  actionPayload: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional()
});
