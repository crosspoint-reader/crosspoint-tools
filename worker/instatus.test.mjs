import assert from 'node:assert/strict'
import test from 'node:test'

import {
  discardPendingBetaNotification,
  flushPendingBetaNotifications,
  flushPendingDeviceNotifications,
  queueBetaNotification,
  refreshPendingBetaNotification,
  reconcileBetaStatus,
  reconcileDeviceBuildStatus,
  reconcileReleaseStatusSnapshot,
  reconcileStableStatus,
} from './instatus.ts'

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
      description: 'Current version: v1.5.0. Stable CrossPoint firmware for the Xteink X4.',
      status: 'OPERATIONAL',
      showUptime: false,
      order: 0,
      archived: false,
      group: 'x4-group',
      translations: {
        name: { en: 'Stable' },
        description: { en: 'Current version: 1.4.1. Stable CrossPoint firmware for the Xteink X4.' },
      },
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

  assert.equal(components.get('x3-stable-created').description, 'v1.5.0')
  assert.equal(components.get('x4-stable').description, 'v1.5.0')
  assert.equal(components.get('x4-stable').translations.description.en, 'v1.5.0')
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
  components.push(
    { id: 'x3-stable-duplicate-1', name: 'Stable', groupId: 'x3-group', status: 'OPERATIONAL' },
    { id: 'x3-stable-duplicate-2', name: 'Stable', groupId: 'x3-group', status: 'OPERATIONAL' },
  )
  let listRequests = 0
  let updates = 0
  let deletes = 0

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
    if (method === 'DELETE' && url.pathname.startsWith('/v1/page/components/')) {
      deletes += 1
      const id = url.pathname.split('/').at(-1)
      const index = components.findIndex(item => item.id === id)
      if (index >= 0) components.splice(index, 1)
      return jsonResponse({ id })
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
      x4pro: [{ name: 'X4 Pro Beta 12', version: '12', fingerprint: 'x4pro-sha' }],
      sticky: [{ name: 'Sticky RC 5', version: 'RC 5', fingerprint: 'sticky-sha' }],
      m5paper: [{ name: 'M5Paper RC1', version: 'RC1', fingerprint: 'm5paper-sha' }],
      lilygo: [{ name: 'LilyGo Beta 2', version: '2', fingerprint: 'lilygo-sha' }],
    },
  })

  assert.equal(listRequests, 1)
  assert.equal(updates, 10)
  assert.equal(deletes, 2)

  await reconcileReleaseStatusSnapshot(env, {
    stable,
    insider,
    betas: [],
    deviceBuilds: {
      x4pro: [{ name: 'X4 Pro Beta 12', version: '12', fingerprint: 'x4pro-sha' }],
      sticky: [{ name: 'Sticky RC 5', version: 'RC 5', fingerprint: 'sticky-sha' }],
      m5paper: [{ name: 'M5Paper RC1', version: 'RC1', fingerprint: 'm5paper-sha' }],
      lilygo: [{ name: 'LilyGo Beta 2', version: '2', fingerprint: 'lilygo-sha' }],
    },
  })
  assert.equal(listRequests, 2)
  assert.equal(updates, 10)
  assert.equal(deletes, 2)
})

test('keeps a failed beta notice queued and retries it without duplicates', async (t) => {
  const kv = new Map()
  const components = new Map([
    ['x3-beta', { id: 'x3-beta', name: 'Beta', group: 'x3-group', description: 'Old' }],
    ['x4-beta', { id: 'x4-beta', name: 'Beta', group: 'x4-group', description: 'Old' }],
  ])
  let incidentAttempts = 0
  const incidents = []

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const id = url.pathname.split('/').at(-1)
    if (method === 'GET' && components.has(id)) return jsonResponse(components.get(id))
    if (method === 'PUT' && components.has(id)) {
      const body = JSON.parse(String(init.body))
      Object.assign(components.get(id), body, { group: body.groupId })
      return jsonResponse(components.get(id))
    }
    if (method === 'POST' && url.pathname === '/v1/page/incidents') {
      incidentAttempts += 1
      if (incidentAttempts === 1) return jsonResponse({ error: 'rate limited' }, 429)
      incidents.push(JSON.parse(String(init.body)))
      return jsonResponse({ id: 'incident-1' }, 201)
    }
    return jsonResponse({ error: `${method} ${url.pathname}` }, 404)
  }

  const env = {
    INSTATUS_API_KEY: 'test-secret',
    INSTATUS_PAGE_ID: 'page',
    INSTATUS_X3_GROUP_ID: 'x3-group',
    INSTATUS_X4_GROUP_ID: 'x4-group',
    INSTATUS_X3_BETA_COMPONENT_ID: 'x3-beta',
    INSTATUS_X4_BETA_COMPONENT_ID: 'x4-beta',
    BUILD_META: {
      get: async key => kv.get(key) ?? null,
      put: async (key, value) => { kv.set(key, value) },
      delete: async key => { kv.delete(key) },
      list: async ({ prefix }) => ({
        keys: [...kv.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })),
        list_complete: true,
        cacheStatus: null,
      }),
    },
  }
  const build = {
    id: 'page-turner',
    title: 'Bluetooth Page Turner Beta',
    version: '10',
    name: 'Bluetooth Page Turner Beta',
    notes: 'Improved reconnect behavior.',
    createdAt: '2026-08-07T09:00:00.000Z',
    updatedAt: '2026-08-07T09:40:45.607Z',
    binaryUpdatedAt: '2026-08-07T09:40:45.607Z',
    firmwareSize: 1234,
    firmwareSha256: 'beta-10-sha',
    source: { type: 'upload' },
  }
  const notification = { kind: 'binary-replaced', build }

  await queueBetaNotification(env, notification)
  await assert.rejects(reconcileBetaStatus(env, [build], notification), /429/)
  assert.ok(kv.has('instatus:pending:beta:page-turner'))

  await flushPendingBetaNotifications(env)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].name, 'Beta updated: Bluetooth Page Turner Beta 10')
  assert.equal(kv.has('instatus:pending:beta:page-turner'), false)

  await flushPendingBetaNotifications(env)
  assert.equal(incidents.length, 1)
})

test('keeps a failed device build notice queued and retries it without duplicates', async (t) => {
  const kv = new Map()
  const components = new Map([
    ['x4pro-beta', { id: 'x4pro-beta', name: 'Beta', group: 'x4pro-group', description: 'Old' }],
  ])
  let incidentAttempts = 0
  const incidents = []

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const id = url.pathname.split('/').at(-1)
    if (method === 'GET' && components.has(id)) return jsonResponse(components.get(id))
    if (method === 'PUT' && components.has(id)) {
      const body = JSON.parse(String(init.body))
      Object.assign(components.get(id), body, { group: body.groupId })
      return jsonResponse(components.get(id))
    }
    if (method === 'POST' && url.pathname === '/v1/page/incidents') {
      incidentAttempts += 1
      if (incidentAttempts === 1) return jsonResponse({ error: 'rate limited' }, 429)
      incidents.push(JSON.parse(String(init.body)))
      return jsonResponse({ id: 'incident-1' }, 201)
    }
    return jsonResponse({ error: `${method} ${url.pathname}` }, 404)
  }

  const env = {
    INSTATUS_API_KEY: 'test-secret',
    INSTATUS_PAGE_ID: 'page',
    INSTATUS_X4_PRO_GROUP_ID: 'x4pro-group',
    INSTATUS_X4_PRO_BETA_COMPONENT_ID: 'x4pro-beta',
    INSTATUS_STICKY_GROUP_ID: 'sticky-group',
    INSTATUS_M5PAPER_GROUP_ID: 'm5paper-group',
    INSTATUS_LILYGO_GROUP_ID: 'lilygo-group',
    BUILD_META: {
      get: async key => kv.get(key) ?? null,
      put: async (key, value) => { kv.set(key, value) },
      delete: async key => { kv.delete(key) },
    },
  }
  const build = {
    name: 'X4 Pro Beta 18',
    version: 'X4 Pro Beta 18',
    fingerprint: 'beta-18-sha',
    notes: 'SD plugin preview.',
  }

  await assert.rejects(reconcileDeviceBuildStatus(env, 'x4pro', [build], build), /429/)
  assert.ok(kv.has('instatus:pending:device:x4pro'))

  await flushPendingDeviceNotifications(env)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].name, 'New X4 Pro build: X4 Pro Beta 18')
  assert.equal(components.get('x4pro-beta').description, 'X4 Pro Beta 18')
  assert.equal(kv.has('instatus:pending:device:x4pro'), false)

  await flushPendingDeviceNotifications(env)
  assert.equal(incidents.length, 1)
})

test('a title fix after queueing updates the pending notice before it fires', async (t) => {
  const kv = new Map()
  const components = new Map([
    ['x3-beta', { id: 'x3-beta', name: 'Beta', group: 'x3-group', description: 'Old' }],
    ['x4-beta', { id: 'x4-beta', name: 'Beta', group: 'x4-group', description: 'Old' }],
  ])
  const incidents = []

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const id = url.pathname.split('/').at(-1)
    if (method === 'GET' && components.has(id)) return jsonResponse(components.get(id))
    if (method === 'PUT' && components.has(id)) {
      const body = JSON.parse(String(init.body))
      Object.assign(components.get(id), body, { group: body.groupId })
      return jsonResponse(components.get(id))
    }
    if (method === 'POST' && url.pathname === '/v1/page/incidents') {
      incidents.push(JSON.parse(String(init.body)))
      return jsonResponse({ id: 'incident-1' }, 201)
    }
    return jsonResponse({ error: `${method} ${url.pathname}` }, 404)
  }

  const env = {
    INSTATUS_API_KEY: 'test-secret',
    INSTATUS_PAGE_ID: 'page',
    INSTATUS_X3_GROUP_ID: 'x3-group',
    INSTATUS_X4_GROUP_ID: 'x4-group',
    INSTATUS_X3_BETA_COMPONENT_ID: 'x3-beta',
    INSTATUS_X4_BETA_COMPONENT_ID: 'x4-beta',
    BUILD_META: {
      get: async key => kv.get(key) ?? null,
      put: async (key, value) => { kv.set(key, value) },
      delete: async key => { kv.delete(key) },
      list: async ({ prefix }) => ({
        keys: [...kv.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })),
        list_complete: true,
        cacheStatus: null,
      }),
    },
  }
  const build = {
    id: 'sd-plugins',
    title: 'SD Plugs + Night Mode',
    version: 'v1',
    name: 'SD Plugs + Night Mode',
    notes: 'Plugin preview.',
    createdAt: '2026-08-11T02:00:00.000Z',
    updatedAt: '2026-08-11T02:00:00.000Z',
    binaryUpdatedAt: '2026-08-11T02:00:00.000Z',
    firmwareSize: 1234,
    firmwareSha256: 'sd-plugins-sha',
    source: { type: 'upload' },
  }

  await queueBetaNotification(env, { kind: 'created', build })
  await refreshPendingBetaNotification(env, { ...build, title: 'SD Plugins + Night Mode' })

  await flushPendingBetaNotifications(env)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].name, 'New beta: SD Plugins + Night Mode v1')

  await discardPendingBetaNotification(env, 'sd-plugins')
  await refreshPendingBetaNotification(env, build)
  assert.equal(kv.has('instatus:pending:beta:sd-plugins'), false)
})
