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

export const BLOG_STATUSES = ['draft', 'published'];

export const adminListQuerySchema = z.strictObject({
  ...paginationShape,
  status: z.enum(BLOG_STATUSES).optional(),
});

// blogs.id is a Postgres int4; larger values would fail in the DB and surface as a 500.
const INT4_MAX = 2_147_483_647;

export const blogIdParamsSchema = z.strictObject({
  id: z.coerce.number().int().positive().max(INT4_MAX),
});
