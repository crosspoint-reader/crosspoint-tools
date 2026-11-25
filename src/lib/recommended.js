// Picks the build that takes the flasher's "Recommended" slot when the stable
// release can't be offered for a device. Order: stable (handled by the caller,
// which passes stableHidden/stableMissing as false) > an admin-picked beta >
// the release candidate > the newest beta.
//
// - stableHidden: the admin hid stable for this device (release visibility).
// - stableMissing: stable loaded fine but ships no asset for this device.
// - builds: the flasher's test-build list ({ id, channel, ... }), in display
//   order; the RC entry has id 'rc' and betas have channel 'Beta'.
// - pickedBetaId: the admin's recommended-beta pick for this device, if any.
//
// Betas are only promoted when stable is hidden (unchanged behavior); the RC
// is promoted whenever stable is unavailable, so a device that only ships in
// the RC gets it as its recommended install.
export function pickRecommendedBuild({ stableHidden, stableMissing, builds, pickedBetaId }) {
  if (!stableHidden && !stableMissing) return null
  const betas = builds.filter((b) => b.channel === 'Beta')
  if (stableHidden && pickedBetaId) {
    const picked = betas.find((b) => b.id === pickedBetaId)
    if (picked) return picked
  }
  const rc = builds.find((b) => b.id === 'rc')
  if (rc) return rc
  return stableHidden ? betas[0] || null : null
}
