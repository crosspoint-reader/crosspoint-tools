import assert from 'node:assert/strict'
import test from 'node:test'

import { reconcileReleaseStatusSnapshot, reconcileStableStatus } from './instatus.ts'

function jsonResponse(value, status = 200) {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('creates a missing stable component and deduplicates release notifications', async (t) => {
  const kv = new Map()
  const components = new Map([
    ['x4-stable', {
      id: 'x4-stable',
      name: 'Stable',
      description: 'Old version',
      status: 'OPERATIONAL',
      showUptime: false,
      order: 0,
      archived: false,
      group: 'x4-group',
    }],
  ])
  const incidents = []

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : null

    if (method === 'GET' && url.pathname === '/v2/page/components/x4-stable') {
      return jsonResponse(components.get('x4-stable'))
    }
    if (method === 'GET' && url.pathname === '/v2/page/components') {
      return jsonResponse([...components.values()])
    }
    if (method === 'POST' && url.pathname === '/v1/page/components') {
      const component = {
        id: 'x3-stable-created',
        ...body,
        group: body.group,
      }
      components.set(component.id, component)
      return jsonResponse(component, 201)
    }
    if (method === 'PUT' && url.pathname.startsWith('/v2/page/components/')) {
      const id = url.pathname.split('/').at(-1)
      components.set(id, { ...components.get(id), ...body, id, group: body.groupId })
      return jsonResponse(components.get(id))
    }
    if (method === 'POST' && url.pathname === '/v1/page/incidents') {
      incidents.push(body)
      return jsonResponse({ id: `incident-${incidents.length}` }, 201)
    }
    return jsonResponse({ error: `${method} ${url.pathname}` }, 404)
  }

  const env = {
    INSTATUS_API_KEY: 'test-secret',
    INSTATUS_PAGE_ID: 'page',
    INSTATUS_X3_GROUP_ID: 'x3-group',
    INSTATUS_X4_GROUP_ID: 'x4-group',
    INSTATUS_X4_STABLE_COMPONENT_ID: 'x4-stable',
    BUILD_META: {
      get: async key => kv.get(key) ?? null,
      put: async (key, value) => { kv.set(key, value) },
    },
  }

  const build = {
    name: 'CrossPoint 1.5.0',
    version: 'v1.5.0',
    fingerprint: 'sha-150',
  }
  await reconcileStableStatus(env, build, true)

  assert.match(components.get('x3-stable-created').description, /v1\.5\.0.*X3/)
  assert.match(components.get('x4-stable').description, /v1\.5\.0.*X4/)
  assert.equal(incidents.length, 1)
  assert.deepEqual(new Set(incidents[0].components), new Set(['x3-stable-created', 'x4-stable']))
  assert.equal(kv.get('instatus:notified:stable'), 'sha-150')

  await reconcileStableStatus(env, build, true)
  assert.equal(incidents.length, 1)

  await reconcileStableStatus(env, { ...build, version: 'v1.5.1', fingerprint: 'sha-151' }, true)
  assert.equal(incidents.length, 2)
  assert.equal(kv.get('instatus:notified:stable'), 'sha-151')
})

test('full reconciliation lists components once instead of fetching each component', async (t) => {
  const definitions = [
    ['x3-stable', 'Stable', 'x3-group'],
    ['x4-stable', 'Stable', 'x4-group'],
    ['x3-nightly', 'Nightly', 'x3-group'],
    ['x4-nightly', 'Nightly', 'x4-group'],
    ['x3-beta', 'Beta', 'x3-group'],
    ['x4-beta', 'Beta', 'x4-group'],
    ['x4pro-beta', 'Beta', 'x4pro-group'],
    ['sticky-beta', 'Beta', 'sticky-group'],
    ['m5paper-beta', 'Beta', 'm5paper-group'],
    ['lilygo-beta', 'Beta', 'lilygo-group'],
  ]
  const components = definitions.map(([id, name, group]) => ({
    id, name, group, status: 'OPERATIONAL', showUptime: false, order: 0, archived: false,
  }))
  let listRequests = 0
  let updates = 0

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    if (method === 'GET' && url.pathname === '/v2/page/components') {
      listRequests += 1
      return jsonResponse(components)
    }
    if (method === 'PUT' && url.pathname.startsWith('/v2/page/components/')) {
      updates += 1
      const id = url.pathname.split('/').at(-1)
      const body = JSON.parse(String(init.body))
      const component = components.find(item => item.id === id)
      Object.assign(component, body, { group: body.groupId })
      return jsonResponse(component)
    }
    return jsonResponse({ error: `${method} ${url.pathname}` }, 404)
  }

  const env = {
    INSTATUS_API_KEY: 'test-secret',
    INSTATUS_PAGE_ID: 'page',
    INSTATUS_X3_GROUP_ID: 'x3-group',
    INSTATUS_X4_GROUP_ID: 'x4-group',
    INSTATUS_X4_PRO_GROUP_ID: 'x4pro-group',
    INSTATUS_STICKY_GROUP_ID: 'sticky-group',
    INSTATUS_M5PAPER_GROUP_ID: 'm5paper-group',
    INSTATUS_LILYGO_GROUP_ID: 'lilygo-group',
    INSTATUS_X3_STABLE_COMPONENT_ID: 'x3-stable',
    INSTATUS_X4_STABLE_COMPONENT_ID: 'x4-stable',
    INSTATUS_X3_NIGHTLY_COMPONENT_ID: 'x3-nightly',
    INSTATUS_X4_NIGHTLY_COMPONENT_ID: 'x4-nightly',
    INSTATUS_X3_BETA_COMPONENT_ID: 'x3-beta',
    INSTATUS_X4_BETA_COMPONENT_ID: 'x4-beta',
    INSTATUS_X4_PRO_BETA_COMPONENT_ID: 'x4pro-beta',
    INSTATUS_STICKY_BETA_COMPONENT_ID: 'sticky-beta',
    INSTATUS_M5PAPER_BETA_COMPONENT_ID: 'm5paper-beta',
    INSTATUS_LILYGO_BETA_COMPONENT_ID: 'lilygo-beta',
    BUILD_META: {
      get: async () => null,
      put: async () => {},
    },
  }
  const stable = { name: 'v1.5.0', version: 'v1.5.0', fingerprint: 'stable-sha' }
  const insider = { name: 'master-abc1234', version: '1.5.1-dev+abc1234', fingerprint: 'insider-sha' }
  await reconcileReleaseStatusSnapshot(env, {
    stable,
    insider,
    betas: [],
    deviceBuilds: {
      x4pro: { name: 'X4 Pro Beta 12', version: '12', fingerprint: 'x4pro-sha' },
      sticky: { name: 'Sticky RC 5', version: 'RC 5', fingerprint: 'sticky-sha' },
      m5paper: { name: 'M5Paper RC1', version: 'RC1', fingerprint: 'm5paper-sha' },
      lilygo: { name: 'LilyGo Beta 2', version: '2', fingerprint: 'lilygo-sha' },
    },
  })

  assert.equal(listRequests, 1)
  assert.equal(updates, 10)

  await reconcileReleaseStatusSnapshot(env, {
    stable,
    insider,
    betas: [],
    deviceBuilds: {
      x4pro: { name: 'X4 Pro Beta 12', version: '12', fingerprint: 'x4pro-sha' },
      sticky: { name: 'Sticky RC 5', version: 'RC 5', fingerprint: 'sticky-sha' },
      m5paper: { name: 'M5Paper RC1', version: 'RC1', fingerprint: 'm5paper-sha' },
      lilygo: { name: 'LilyGo Beta 2', version: '2', fingerprint: 'lilygo-sha' },
    },
  })
  assert.equal(listRequests, 2)
  assert.equal(updates, 10)
})
