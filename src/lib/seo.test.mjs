import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageMeta, pageHead, isPage, sitemapXml, canonicalUrl, OG_IMAGE } from './seo.ts'

test('canonical URLs normalize trailing slashes', () => {
  assert.equal(canonicalUrl('/'), 'https://crosspointreader.com')
  assert.equal(canonicalUrl('/devices/'), 'https://crosspointreader.com/devices')
})
test('sitemap includes public pages and articles, excludes private and removed pages', () => {
  const xml = sitemapXml()
  for (const path of ['/install', '/devices', '/blog/release-2.0.0']) assert.ok(xml.includes(canonicalUrl(path)))
  for (const path of ['/admin', '/login', '/insider', '/theme-builder']) assert.ok(!xml.includes(canonicalUrl(path)))
})
test('unknown and removed routes cannot masquerade as indexed homepages', () => {
  for (const path of ['/missing', '/blog/missing', '/blog/constructor', '/theme-builder', '/constructor']) {
    assert.equal(isPage(path), false)
    assert.equal(pageMeta(path).noindex, true)
  }
  assert.equal(isPage('/devices/'), true)
})
test('social metadata uses the hero image and private routes have noindex', () => {
  const head = pageHead('/')
  assert.ok(head.includes(OG_IMAGE))
  assert.ok(head.includes('Read without limits.'))
  assert.ok(head.includes('max-image-preview:large'))
  assert.equal((head.match(/rel="canonical"/g) || []).length, 1)
  assert.ok(pageHead('/admin').includes('noindex, follow'))
  assert.ok(!pageHead('/devices').includes('noindex'))
})
test('structured data is valid JSON and article metadata is escaped', () => {
  const json = pageHead('/').match(/<script[^>]*>(.*?)<\/script>/s)[1]
  assert.equal(JSON.parse(json)['@graph'][0].name, 'CrossPoint Reader')
  assert.ok(pageHead('/roadmap').includes('Roadmap &amp; Scope'))
  assert.ok(pageHead('/blog/release-2.0.0').includes('article:published_time'))
  assert.equal(pageMeta('/blog/release-2.0.0').type, 'article')
})
