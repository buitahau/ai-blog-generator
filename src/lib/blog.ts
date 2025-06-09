import { supabase, BlogPost } from './supabase'
import { BlogPostMetadata } from '@/types/blog'

export async function getAllBlogPosts(
  page: number = 1,
  limit: number = 6,
  searchTerm?: string
): Promise<{ posts: BlogPostMetadata[]; hasMore: boolean; total: number }> {
  try {
    let query = supabase
      .from('blog_posts')
      .select('id, slug, title, description, published_date', { count: 'exact' })
      .eq('is_published', true)
      .order('published_date', { ascending: false })

    // Add search filter if provided
    if (searchTerm && searchTerm.trim()) {
      query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
    }

    // Add pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching blog posts:', error)
      return { posts: [], hasMore: false, total: 0 }
    }

    const posts: BlogPostMetadata[] = (data || []).map((post) => ({
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.published_date,
      url: `/blog/${post.slug}`,
    }))

    const total = count || 0
    const hasMore = from + limit < total

    return { posts, hasMore, total }
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    return { posts: [], hasMore: false, total: 0 }
  }
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error) {
      console.error('Error fetching blog post:', error)
      return null
    }

    return data ? {
      slug: data.slug,
      title: data.title,
      description: data.description,
      date: data.published_date,
      content: data.content,
      url: `/blog/${data.slug}`,
    } : null
  } catch (error) {
    console.error('Error fetching blog post:', error)
    return null
  }
}

export async function getAllBlogSlugs(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug')
      .eq('is_published', true)

    if (error) {
      console.error('Error fetching blog slugs:', error)
      return []
    }

    return (data || []).map(post => post.slug)
  } catch (error) {
    console.error('Error fetching blog slugs:', error)
    return []
  }
}