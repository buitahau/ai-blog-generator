import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-6 py-32">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-6xl md:text-8xl font-light text-white mb-8 leading-tight">
            FlowPay{' '}
            <span className="text-blue-400 font-medium">Blog</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
            Insights, updates, and stories from the world of global payments. 
            Stay informed about the latest in fintech innovation.
          </p>

          <Link 
            href="/blog"
            className="inline-flex items-center space-x-3 bg-blue-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
          >
            <span>Explore Articles</span>
            <ArrowRight size={20} />
          </Link>
        </div>
      </div>
    </div>
  )
}