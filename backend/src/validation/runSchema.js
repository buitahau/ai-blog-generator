import { z } from 'zod';

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;

export const startRunSchema = z.strictObject({
  title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
});
