// Formatting + firmware-identification helpers for the debug console.
// Ported near-verbatim from the inline scripts in the old /debug.html.

export const fmtHex = (n) => '0x' + n.toString(16).toUpperCase().padStart(6, '0')

export const fmtSize = (n) => {
  if (n >= 0x100000) return (n / 0x100000).toFixed(2) + ' MB'
  if (n >= 0x400) return (n / 0x400).toFixed(1) + ' KB'
  return n + ' B'
}

export function hexPreview(data, limit = 512) {
  const bytes = Array.from(data.slice(0, limit), (b) => b.toString(16).padStart(2, '0').toUpperCase())
  const lines = []
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(`${i.toString(16).toUpperCase().padStart(6, '0')}: ${bytes.slice(i, i + 16).join(' ')}`)
  }
  return lines.join('\n')
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false })

export function findString(data, searchString, startOffset = 0) {
  const searchBytes = encoder.encode(searchString)
  for (let i = startOffset; i <= data.length - searchBytes.length; i++) {
    let match = true
    for (let j = 0; j < searchBytes.length; j++) {
      if (data[i + j] !== searchBytes[j]) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return -1
}

export function extractVersion(data, searchLimit = 25000) {
  const searchArea = data.slice(0, Math.min(data.length, searchLimit))
  for (let i = 0; i < searchArea.length - 8; i++) {
    if (searchArea[i] === 0x56) {
      const match = decoder
        .decode(searchArea.slice(i, Math.min(i + 10, searchArea.length)))
        .match(/V\d+\.\d+\.\d+/)
      if (match) return match[0]
    }
  }
  const fullString = decoder.decode(searchArea)
  const crossPointMatch = fullString.match(/CrossPoint-ESP32-(\d+\.\d+\.\d+)/)
  if (crossPointMatch) return crossPointMatch[1]
  for (const line of fullString.split(/[\x00\n]/)) {
    const match = line.match(/^\d+\.\d+\.\d+$/)
    if (match) return match[0]
  }
  const versionMatch = fullString.match(/(?:Version[:\s]*)(\d+\.\d+\.\d+)/i)
  return versionMatch?.[1] || 'unknown'
}

export function identifyFirmwareData(data) {
  const validImage =
    data.length >= 0x24 &&
    data[0] === 0xe9 &&
    new DataView(data.buffer, data.byteOffset).getUint32(0x20, true) === 0xabcd5432
  const searchArea = data.slice(0, Math.min(data.length, 25000))
  const version = extractVersion(searchArea)
  const versionOffset = version !== 'unknown' ? findString(searchArea, version) : -1
  if (versionOffset !== -1 && version.startsWith('V') && validImage) {
    const start = Math.max(0, versionOffset - 50)
    const end = Math.min(searchArea.length, versionOffset + version.length + 50)
    return findString(searchArea.slice(start, end), 'XTOS') !== -1
      ? { type: 'official-chinese', version, displayName: 'Official Chinese' }
      : { type: 'official-english', version, displayName: 'Official English' }
  }
  if (findString(data, 'CrossPoint-ESP32-') !== -1 || findString(data, 'Starting CrossPoint version') !== -1) {
    return { type: 'crosspoint', version, displayName: 'CrossPoint Community Reader' }
  }
  return { type: 'unknown', version, displayName: 'Custom/Unknown Firmware' }
}
