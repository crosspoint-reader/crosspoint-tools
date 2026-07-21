const ACTION_LABELS = {
  download: 'Firmware download completed',
  flash: 'Firmware flash completed',
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function buildFirmwareEventNames(action, { device, channel, version, source } = {}) {
  const base = ACTION_LABELS[action]
  if (!base) return []

  const deviceLabel = cleanLabel(device)
  const firmwareLabel = [cleanLabel(channel), cleanLabel(version)].filter(Boolean).join(' ')
  const sourceLabel = cleanLabel(source)

  return [
    base,
    deviceLabel && firmwareLabel && `${base} selection ${deviceLabel} ${firmwareLabel}`,
    deviceLabel && `${base} device ${deviceLabel}`,
    firmwareLabel && `${base} version ${firmwareLabel}`,
    sourceLabel && `${base} source ${sourceLabel}`,
  ].filter(Boolean)
}

// Fathom is deliberately optional: privacy tools and network policies may
// block it, and analytics must never interfere with a download or flash.
export function trackFirmwareAction(action, details) {
  if (typeof window === 'undefined' || typeof window.fathom?.trackEvent !== 'function') return

  for (const eventName of buildFirmwareEventNames(action, details)) {
    try {
      window.fathom.trackEvent(eventName)
    } catch {
      // Analytics failures are intentionally ignored.
    }
  }
}
