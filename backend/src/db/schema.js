import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

export const blogStatus = pgEnum('blog_status', ['draft', 'published']);

export const blogs = pgTable(
  'blogs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    excerpt: text().notNull(),
    contentMd: text('content_md').notNull(),
    topic: text().notNull(),
    sources: jsonb().notNull().default([]),
    status: blogStatus().notNull(),
    runId: uuid('run_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [index('blogs_status_published_at_idx').on(t.status, t.publishedAt.desc())],
);
