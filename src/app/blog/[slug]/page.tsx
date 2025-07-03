export const runtime = 'edge';

import { notFound } from 'next/navigation';
import { getBlogPost } from '@/lib/blog';
import BlogPostContent from '@/app/blog/[slug]/BlogPostContent'; // your client component if needed

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <div>
      <h1>{post.title}</h1>
      <BlogPostContent post={post} />
    </div>
  );
}