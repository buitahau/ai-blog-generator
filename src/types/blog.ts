
export type BlogPost = {
  id: string
  slug: string
  title: string
  description: string
  content: string
  published_date: string
  created_at: string
  updated_at: string
  is_published: boolean,
  url: string
}

export interface BlogPostMetadata {
  slug: string
  title: string
  description: string
  date: string
  url: string
}

export interface BlogResponse {
  posts: BlogPostMetadata[]
  hasMore: boolean
  total: number
}