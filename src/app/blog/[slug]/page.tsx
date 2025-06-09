export const runtime = 'edge';

import BlogPostPage from '@/app/blog/[slug]/slug';

export default function DashboardPage() {
  return <BlogPostPage params={{ slug: '' }} />;
}