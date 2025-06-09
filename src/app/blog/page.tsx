'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Calendar, ArrowLeft, Search, Loader2 } from 'lucide-react'
import { BlogPostMetadata, BlogResponse } from '@/types/blog'

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPostMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const fetchPosts = useCallback(async (page: number = 1, search?: string, append: boolean = false) => {
    try {
      if (page === 1 && !append) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '6',
        ...(search && { search })
      })

      const response = await fetch(`/api/blog?${params}`)
      const data: BlogResponse = await response.json()

      if (append && page > 1) {
        setPosts(prev => [...prev, ...data.posts])
      } else {
        setPosts(data.posts)
      }

      setHasMore(data.hasMore)
      setTotal(data.total)
      setCurrentPage(page)
    } catch (error) {
      console.error('Error fetching posts:', error)
      setPosts([])
      setHasMore(false)
      setTotal(0)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts(1, searchTerm)
    setCurrentPage(1)
  }, [searchTerm, fetchPosts])

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPosts(currentPage + 1, searchTerm, true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-400" size={48} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-700">
        <div className="container mx-auto px-6 py-16">
          <div className="flex items-center space-x-4 mb-8">
            <Link 
              href="/"
              className="inline-flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              <span>Back to Home</span>
            </Link>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-light text-white mb-6">
            Latest <span className="text-blue-400 font-medium">Articles</span>
          </h1>
          
          <p className="text-xl text-slate-300 max-w-2xl">
            Discover insights about global payments, fintech innovation, and financial technology trends.
          </p>

          {total > 0 && (
            <p className="text-slate-400 mt-4">
              {searchTerm ? `Found ${total} articles matching "${searchTerm}"` : `${total} articles available`}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-6 py-16">
        {/* Search Bar */}
        <div className="max-w-md mx-auto mb-16">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-full pl-12 pr-6 py-4 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </div>
        </div>

        {/* Blog Grid */}
        {posts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {posts.map((post, index) => (
                <motion.article
                  key={post.slug}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="group"
                >
                  <Link href={`/blog/${post.slug}`}>
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 hover:bg-slate-750 hover:border-slate-600 transition-all duration-300 h-full flex flex-col">
                      <div className="flex-1">
                        <h2 className="text-2xl font-semibold text-white mb-4 group-hover:text-blue-400 transition-colors line-clamp-2">
                          {post.title}
                        </h2>
                        
                        <p className="text-slate-300 mb-6 leading-relaxed line-clamp-3">
                          {post.description}
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2 text-slate-500 text-sm">
                        <Calendar size={16} />
                        <time dateTime={post.date}>
                          {new Date(post.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </time>
                      </div>
                    </div>
                  </Link>
                </motion.article>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="text-center">
                <motion.button
                  onClick={loadMore}
                  disabled={loadingMore}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-blue-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center space-x-3 shadow-lg hover:shadow-xl"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load More Articles</span>
                  )}
                </motion.button>
              </div>
            )}
          </>
        ) : (
          /* No Results */
          <div className="text-center py-16">
            <div className="text-slate-400 text-xl mb-4">
              {searchTerm ? `No articles found for "${searchTerm}"` : 'No articles available'}
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}