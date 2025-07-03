export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server'
import { getAllBlogPosts } from '@/lib/blog'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '6')
    const search = searchParams.get('search') || undefined

    const result = await getAllBlogPosts(page, limit, search)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blog posts', posts: [], hasMore: false, total: 0 }, 
      { status: 500 }
    )
  }
}