import { z } from 'zod';

export const TONES = ['professional', 'casual', 'friendly', 'persuasive', 'technical'];
export const LENGTHS = ['short', 'medium', 'long'];

// strictObject rejects unknown keys so clients can't override max_tokens or model.
export const generateSchema = z.strictObject({
  topic: z.string().trim().min(3).max(200),
  tone: z.enum(TONES).default('professional'),
  length: z.enum(LENGTHS).default('medium'),
  // Blank audience means "not provided" so prompt templates can test for presence.
  audience: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  keywords: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});
