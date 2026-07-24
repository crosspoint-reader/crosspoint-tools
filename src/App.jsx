import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import HomePage from './pages/HomePage.jsx'

const DocsPage = lazy(() => import('./pages/DocsPage.jsx'))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage.jsx'))
const FontsPage = lazy(() => import('./pages/FontsPage.jsx'))
const ThemeBuilderPage = lazy(() => import('./pages/ThemeBuilderPage.jsx'))
const DebugPage = lazy(() => import('./pages/DebugPage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const InsiderPage = lazy(() => import('./pages/InsiderPage.jsx'))
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const KosyncPage = lazy(() => import('./pages/KosyncPage.jsx'))
const UnlockerPage = lazy(() => import('./pages/UnlockerPage.jsx'))
const ContactPage = lazy(() => import('./pages/ContactPage.jsx'))
const UnlockPage = lazy(() => import('./pages/UnlockPage.jsx'))
const AccessoriesPage = lazy(() => import('./pages/AccessoriesPage.jsx'))
const DevicesPage = lazy(() => import('./pages/DevicesPage.jsx'))
const BlogPage = lazy(() => import('./pages/BlogPage.jsx'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage.jsx'))

// Old static-site URLs that must keep working.
const HTML_REDIRECTS = {
  '/index.html': '/',
  '/docs.html': '/docs',
  '/roadmap.html': '/roadmap',
  '/fonts.html': '/fonts',
  '/theme-builder.html': '/theme-builder',
  '/debug.html': '/debug',
  '/admin.html': '/admin',
  '/insider.html': '/insider',
  '/login.html': '/login',
  '/kosync.html': '/kosync',
  '/sticky.html': '/#flash-tools',
  '/unlocker.html': '/unlocker',
}

// Hash anchors whose sections moved off the homepage onto standalone pages.
// Old deep links (e.g. /#unlock-tool from Reddit posts) forward to the page.
const HASH_REDIRECTS = {
  '#unlock-tool': '/unlock',
  '#get-in-touch': '/contact',
}

// On every route change start at the top; when the URL carries a hash anchor,
// scroll to it once the page has rendered.
function ScrollManager() {
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (hash) {
      const to = HASH_REDIRECTS[hash]
      if (to) {
        navigate(to, { replace: true })
        return
      }
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash, navigate])
  return null
}

export default function App() {
  return (
    <div className="isolate min-h-dvh bg-stone-50 font-sans text-stone-900 antialiased">
      <ScrollManager />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/fonts" element={<FontsPage />} />
          <Route path="/theme-builder" element={<ThemeBuilderPage />} />
          <Route path="/debug" element={<DebugPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/insider" element={<InsiderPage />} />
          <Route path="/early-access" element={<Navigate to="/insider" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kosync" element={<KosyncPage />} />
          {/* Standalone Sticky flasher merged into the homepage flasher */}
          <Route path="/sticky" element={<Navigate to="/#flash-tools" replace />} />
          <Route path="/unlocker" element={<UnlockerPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/unlock" element={<UnlockPage />} />
          <Route path="/accessories" element={<AccessoriesPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          {Object.entries(HTML_REDIRECTS).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
