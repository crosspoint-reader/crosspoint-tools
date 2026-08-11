import assert from 'node:assert/strict'
import test from 'node:test'

import {
  betaComponentDescription,
  betaDevices,
  betaDisplayName,
  betaNotificationMessage,
  normalizeBetaBuild,
  normalizeBetaBuildList,
} from './betas.ts'

test('normalizes a legacy beta name without breaking old records', () => {
  const build = normalizeBetaBuild({
    id: 'beta-old',
    name: 'Bluetooth Page Turner v9',
    notes: 'Try the new controls.',
    createdAt: '2026-08-01T12:00:00.000Z',
    firmwareSize: 1234,
    hiddenDevices: ['x3', 'invalid', 'x3'],
  })

  assert.ok(build)
  assert.equal(build.title, 'Bluetooth Page Turner v9')
  assert.equal(build.name, build.title)
  assert.equal(build.version, '')
  assert.equal(build.updatedAt, build.createdAt)
  assert.equal(build.binaryUpdatedAt, build.createdAt)
  assert.deepEqual(build.hiddenDevices, ['x3'])
  assert.deepEqual(build.source, { type: 'upload' })
})

test('keeps title and version independent and builds a display label', () => {
  const build = normalizeBetaBuild({
    id: 'beta-current',
    title: 'CrossPoint',
    version: '1.5 RC5',
    name: 'stale compatibility name',
    notes: '',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
    binaryUpdatedAt: '2026-08-03T12:00:00.000Z',
    firmwareSize: 5678,
  })

  assert.ok(build)
  assert.equal(build.title, 'CrossPoint')
  assert.equal(build.name, 'CrossPoint')
  assert.equal(build.version, '1.5 RC5')
  assert.equal(betaDisplayName(build), 'CrossPoint 1.5 RC5')
})

test('filters invalid records and derives visible devices', () => {
  const builds = normalizeBetaBuildList([
    { id: 'one', title: 'One', version: 'v1' },
    null,
    { title: 'Missing id' },
  ])

  assert.equal(builds.length, 1)
  assert.deepEqual(betaDevices(builds[0]), ['x3', 'x4'])
  builds[0].hiddenDevices = ['x4']
  assert.deepEqual(betaDevices(builds[0]), ['x3'])
})

test('describes only active betas for each persistent device component', () => {
  const builds = normalizeBetaBuildList([
    { id: 'both', title: 'CrossPoint', version: '1.5 RC5' },
    { id: 'x4-only', title: 'Page Turner', version: 'v10', hiddenDevices: ['x3'] },
  ])

  assert.equal(
    betaComponentDescription(builds, 'x4'),
    'CrossPoint 1.5 RC5; Page Turner v10'
  )
  assert.equal(betaComponentDescription(builds, 'x3'), 'CrossPoint 1.5 RC5')
  assert.equal(betaComponentDescription([], 'x3'), 'No active beta builds.')
})

test('includes changelog notes in subscriber notifications', () => {
  const [build] = normalizeBetaBuildList([
    {
      id: 'notes',
      title: 'CrossPoint',
      version: '1.5 RC5',
      notes: '## Highlights\n\n- Faster page turns\n- Fixed Wi-Fi reconnects',
      hiddenDevices: ['x3'],
    },
  ])

  assert.equal(
    betaNotificationMessage(build, 'binary-replaced'),
    'CrossPoint 1.5 RC5 has a new firmware binary for Xteink X4.\n\n' +
      '## Highlights\n\n- Faster page turns\n- Fixed Wi-Fi reconnects'
  )
})

test('keeps notifications concise when a beta has no notes', () => {
  const [build] = normalizeBetaBuildList([
    { id: 'no-notes', title: 'Page Turner', version: 'v10', notes: '   ' },
  ])

  assert.equal(
    betaNotificationMessage(build, 'created'),
    'Page Turner v10 is now available for Xteink X3 and Xteink X4.'
  )
  assert.equal(
    betaNotificationMessage(build, 'version-bumped'),
    'Page Turner v10 is now available for Xteink X3 and Xteink X4.'
  )
})
