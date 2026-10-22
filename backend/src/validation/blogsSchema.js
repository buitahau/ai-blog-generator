import { z } from 'zod';

export const PAGE_SIZE_MAX = 50;
export const PAGE_SIZE_DEFAULT = 10;

// Shared with the admin list endpoint (B05). Query values arrive as strings, hence coerce.
export const paginationShape = {
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
};

export const paginationSchema = z.strictObject(paginationShape);

export const listBlogsQuerySchema = paginationSchema;
