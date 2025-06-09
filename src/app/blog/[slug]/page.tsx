import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { getBlogPost, getAllBlogSlugs } from '@/lib/blog'

interface BlogPostPageProps {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  const slugs = await getAllBlogSlugs()
  return slugs.map((slug) => ({
    slug,
  }))
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug)
  
  if (!post) {
    return {
      title: 'Post Not Found',
    }
  }

  return {
    title: `${post.title} | FlowPay Blog`,
    description: post.description,
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug)

  if (!post) {
    notFound()
  }

  const readingTime = Math.ceil(post.content.split(' ').length / 200)

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-700">
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-4 mb-8">
              <Link 
                href="/blog"
                className="inline-flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Back to Blog</span>
              </Link>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-light text-white mb-6 leading-tight">
              {post.title}
            </h1>
            
            <div className="flex items-center space-x-6 text-slate-400">
              <div className="flex items-center space-x-2">
                <Calendar size={18} />
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
              </div>
              <div className="flex items-center space-x-2">
                <Clock size={18} />
                <span>{readingTime} min read</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <article className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="prose-custom">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeRaw]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-4xl font-semibold text-white mb-6 mt-12 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-3xl font-semibold text-white mb-4 mt-10">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-2xl font-semibold text-white mb-4 mt-8">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-slate-300 mb-6 leading-relaxed text-lg">
                    {children}
                  </p>
                ),
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    className="text-blue-400 hover:text-blue-300 transition-colors underline decoration-blue-400/30 hover:decoration-blue-300"
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                  >
                    {children}
                  </a>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-blue-500 pl-6 my-8 italic text-slate-300 bg-slate-800 py-4 rounded-r-lg">
                    {children}
                  </blockquote>
                ),
                code: ({ children, className }) => {
                  const isInline = !className
                  if (isInline) {
                    return (
                      <code className="bg-slate-800 text-blue-400 px-2 py-1 rounded text-sm">
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code className={className}>
                      {children}
                    </code>
                  )
                },
                pre: ({ children }) => (
                  <pre className="bg-slate-800 border border-slate-700 rounded-lg p-6 overflow-x-auto my-8">
                    {children}
                  </pre>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-2 mb-6 text-slate-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-2 mb-6 text-slate-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-slate-300 leading-relaxed">
                    {children}
                  </li>
                ),
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          {/* Back to Blog */}
          <div className="mt-16 pt-8 border-t border-slate-700">
            <Link 
              href="/blog"
              className="inline-flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors text-lg"
            >
              <ArrowLeft size={20} />
              <span>Back to all articles</span>
            </Link>
          </div>
        </div>
      </article>
    </div>
  )
}