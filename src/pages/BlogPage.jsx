// Blog index: lists posts bundled from blog/*.md, newest first.
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { posts } from './blog/posts.js'

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function Avatar({ author }) {
  if (!author?.avatarUrl) return null
  return (
    <img
      src={author.avatarUrl}
      alt=""
      loading="lazy"
      className="size-6 shrink-0 rounded-full bg-stone-100 object-cover ring-1 ring-stone-950/5"
    />
  )
}

export default function BlogPage() {
  return (
    <Layout>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16 lg:px-8">
          <Eyebrow>Blog</Eyebrow>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Updates &amp; announcements
          </h1>
          <p className="mt-2 text-stone-600">
            Important news from the CrossPoint Reader project.
          </p>

          {posts.length === 0 ? (
            <p className="mt-10 text-stone-500">No posts yet. Check back soon.</p>
          ) : (
            <ul className="mt-10 divide-y divide-stone-200">
              {posts.map((post) => (
                <li key={post.slug} className="py-8 first:pt-0">
                  <article>
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <Avatar author={post.author} />
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
                    <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-stone-900">
                      <Link
                        to={`/blog/${post.slug}`}
                        className="transition hover:text-brand-700"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    {post.summary && (
                      <p className="mt-2 text-stone-600">{post.summary}</p>
                    )}
                    <Link
                      to={`/blog/${post.slug}`}
                      className="mt-3 inline-flex items-center gap-x-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
                    >
                      Read more
                      <span aria-hidden="true">&rarr;</span>
                    </Link>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  )
}
