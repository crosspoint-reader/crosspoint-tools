import assert from 'node:assert/strict'
import test from 'node:test'
import { pickRecommendedBuild } from './recommended.js'

const nightly = { id: 'nightly', channel: 'Nightly' }
const rc = { id: 'rc', channel: 'Release candidate' }
const betaA = { id: 'beta-a', channel: 'Beta' }
const betaB = { id: 'beta-b', channel: 'Beta' }

test('recommends nothing while stable is available', () => {
  assert.equal(pickRecommendedBuild({ stableHidden: false, stableMissing: false, builds: [nightly, rc, betaA] }), null)
})

test('prefers the release candidate over the newest beta when stable is hidden', () => {
  assert.equal(pickRecommendedBuild({ stableHidden: true, stableMissing: false, builds: [nightly, rc, betaA, betaB] }), rc)
})

test('keeps an explicit admin beta pick ahead of the release candidate', () => {
  assert.equal(
    pickRecommendedBuild({ stableHidden: true, stableMissing: false, builds: [rc, betaA, betaB], pickedBetaId: 'beta-b' }),
    betaB
  )
})

test('falls back to the RC when the picked beta no longer exists', () => {
  assert.equal(
    pickRecommendedBuild({ stableHidden: true, stableMissing: false, builds: [rc, betaA], pickedBetaId: 'beta-gone' }),
    rc
  )
})

test('falls back to the newest beta when stable is hidden and there is no RC', () => {
  assert.equal(pickRecommendedBuild({ stableHidden: true, stableMissing: false, builds: [nightly, betaA, betaB] }), betaA)
})

test('recommends the RC when stable ships no asset for the device', () => {
  assert.equal(pickRecommendedBuild({ stableHidden: false, stableMissing: true, builds: [nightly, rc, betaA] }), rc)
})

test('does not promote betas when stable is missing but not hidden', () => {
  assert.equal(pickRecommendedBuild({ stableHidden: false, stableMissing: true, builds: [nightly, betaA] }), null)
})

test('ignores the admin beta pick unless stable is hidden', () => {
  assert.equal(
    pickRecommendedBuild({ stableHidden: false, stableMissing: true, builds: [rc, betaA], pickedBetaId: 'beta-a' }),
    rc
  )
})
