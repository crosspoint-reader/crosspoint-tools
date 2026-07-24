// Single blog post: renders a bundled markdown post through the shared
// marked + DOMPurify pipeline, styled with the docs-prose treatment.
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { createMarkdownRenderer } from '../lib/markdown-full.js'
import { getPost } from './blog/posts.js'
import './docs/docs-prose.css'

// Post images live under the site's own /public/blog; leave absolute and
// external URLs untouched, and resolve bare filenames against /blog/.
const renderMarkdown = createMarkdownRenderer({ imageRelativePrefix: '/blog/' })

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = getPost(slug)
  const html = useMemo(() => (post ? renderMarkdown(post.body) : ''), [post])

  if (!post) return <Navigate to="/blog" replace />

  return (
    <Layout>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16 lg:px-8">
          <Link
            to="/blog"
            className="inline-flex items-center gap-x-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-800"
          >
            <span aria-hidden="true">&larr;</span>
            Back to blog
          </Link>

          <header className="mt-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              {post.title}
            </h1>
            <div className="mt-4 flex items-center gap-2.5 text-sm text-stone-500">
              {post.author?.avatarUrl && (
                <img
                  src={post.author.avatarUrl}
                  alt=""
                  className="size-7 shrink-0 rounded-full bg-stone-100 object-cover ring-1 ring-stone-950/5"
                />
              )}
              <span className="font-medium text-stone-700">{post.author?.name}</span>
              {post.date && (
                <>
                  <span aria-hidden="true" className="text-stone-300">
                    &middot;
                  </span>
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                </>
              )}
            </div>
          </header>

          <article
            className="docs-prose mt-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </section>
    </Layout>
  )
}
