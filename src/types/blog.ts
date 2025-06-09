export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  content: string
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