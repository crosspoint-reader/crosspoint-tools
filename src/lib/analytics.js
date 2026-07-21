const DEVICE_LABELS = {
  x3: 'Xteink X3',
  x4: 'Xteink X4',
  sticky: 'Seeed Sticky',
  m5paper: 'M5Paper',
  lilygo: 'LilyGo T5',
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function buildFirmwareFlashEventName({ device, channel, version } = {}) {
  const deviceLabel = DEVICE_LABELS[device] || cleanLabel(device)
  if (!deviceLabel) return null

  const channelLabel = cleanLabel(channel)
  const versionLabel = cleanLabel(version)
  const firmwareLabel =
    channelLabel.toLowerCase() === versionLabel.toLowerCase()
      ? channelLabel
      : [channelLabel, versionLabel].filter(Boolean).join(' ')

  return `Firmware flashed ${deviceLabel}${firmwareLabel ? ` ${firmwareLabel}` : ''}`
}

// Fathom is deliberately optional: privacy tools and network policies may
// block it, and analytics must never interfere with a successful flash.
export function trackFirmwareFlash(details) {
  if (typeof window === 'undefined' || typeof window.fathom?.trackEvent !== 'function') return

  const eventName = buildFirmwareFlashEventName(details)
  if (!eventName) return

  try {
    window.fathom.trackEvent(eventName)
  } catch {
    // Analytics failures are intentionally ignored.
  }
}
