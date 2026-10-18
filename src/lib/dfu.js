export const MAX_IMAGE = 0x640000
const encoder = new TextEncoder()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const digest = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))

// Match the installed updater's app-image checks; merged whole-flash images
// are intentionally rejected. The device independently verifies flash readback.
export async function validateImage(bytes, expectedHash, model = 'x3') {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 65536 ||
    bytes.length > MAX_IMAGE
  )
    throw new Error('Choose an application .bin between 64 KiB and 6.25 MiB.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] !== 0xe9)
    throw new Error('This file is not an ESP application image.')
  const pro = model === 'x4pro'
  if (!['x3', 'x4', 'x4pro'].includes(model))
    throw new Error('Unsupported reader model.')
  if (view.getUint16(12, true) !== (pro ? 9 : 5))
    throw new Error(
      pro
        ? 'This firmware is not for the ESP32-S3 in the X4 Pro.'
        : 'This firmware is not for the ESP32-C3 in the X3/X4.'
    )
  let boardSeen = false
  if (bytes[1] < 1 || bytes[1] > 16)
    throw new Error('Invalid firmware segment table.')
  let pos = 24,
    checksum = 0xef
  for (let segment = 0; segment < bytes[1]; segment++) {
    if (pos + 8 > bytes.length) throw new Error('The firmware is truncated.')
    const size = view.getUint32(pos + 4, true)
    pos += 8
    if (size > bytes.length - pos)
      throw new Error('A firmware segment extends past the end of the file.')
    const payload = bytes.subarray(pos, pos + size)
    for (const byte of payload) checksum ^= byte
    const text = new TextDecoder('latin1').decode(payload)
    for (const match of text.matchAll(/CROSSPOINT-BOARD-V1:([^;\s]{1,24});/g)) {
      boardSeen = true
      if (match[1] !== (pro ? 'x4pro' : 'x4'))
        throw new Error(
          `This image targets ${match[1]}, not the selected ${model} firmware family.`
        )
    }
    pos += size
  }
  if (pro && !boardSeen)
    throw new Error(
      'X4 Pro USB updates require a matching CrossPoint board tag.'
    )
  const padEnd = (pos + 16) & ~15
  if (padEnd + (bytes[23] ? 32 : 0) !== bytes.length)
    throw new Error(
      'Choose the app-only .bin, not a merged flash image or a truncated download.'
    )
  if (bytes[padEnd - 1] !== checksum)
    throw new Error('The firmware checksum is invalid.')
  if (
    bytes[23] &&
    hex(await digest(bytes.subarray(0, padEnd))) !== hex(bytes.subarray(padEnd))
  )
    throw new Error('The firmware’s embedded SHA-256 is invalid.')
  const sha = await digest(bytes)
  if (expectedHash && hex(sha) !== expectedHash)
    throw new Error('The bundled firmware does not match its expected SHA-256.')
  return { bytes, sha, sha256: hex(sha) }
}

export async function encodeImage(
  image,
  onProgress = () => {},
  cancelled = () => false
) {
  if (typeof CompressionStream === 'undefined')
    throw new Error('Update Chrome or Edge to enable compressed transfers.')
  const records = []
  let total = 0
  for (let offset = 0; offset < image.length; offset += 32760) {
    if (cancelled()) throw new Cancelled()
    const raw = image.subarray(offset, offset + 32760)
    const stream = new Blob([raw])
      .stream()
      .pipeThrough(new CompressionStream('deflate'))
    let packed = new Uint8Array(await new Response(stream).arrayBuffer())
    const stored = packed.length >= raw.length
    if (stored) packed = raw
    const record = new Uint8Array(
      Math.max(8192, Math.ceil((8 + packed.length) / 4096) * 4096)
    )
    const view = new DataView(record.buffer)
    view.setUint32(0, (packed.length | (stored ? 0x80000000 : 0)) >>> 0, true)
    view.setUint32(4, raw.length, true)
    record.set(packed, 8)
    records.push(record)
    total += record.length
    onProgress(Math.min(offset + raw.length, image.length) / image.length)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const record of records) {
    result.set(record, offset)
    offset += record.length
  }
  return result
}

export class Cancelled extends Error {
  constructor() {
    super('Update cancelled before installation was confirmed.')
    this.name = 'Cancelled'
  }
}
export function versionOf(device) {
  return (
    (device.deviceVersionMajor << 8) |
    (device.deviceVersionMinor << 4) |
    device.deviceVersionSubminor
  )
}
export class DfuClient {
  constructor(
    device,
    {
      wait = sleep,
      timeoutMs = 10000,
      onEvent = () => {},
      compress = false,
    } = {}
  ) {
    this.device = device
    this.wait = wait
    this.timeoutMs = timeoutMs
    this.onEvent = onEvent
    this.compress = compress
    this.version = versionOf(device)
    this.model = this.version === 0x0800 ? 'x4pro' : 'x3'
    this.interfaceNumber = 0
    this.blockSize = this.version === 0x0200 ? 64 : 4096
    this.cancelled = false
    this.manifestRequested = false
    this.usable = true
    this.claimed = false
    this.trace = []
  }
  async connect() {
    if (
      this.device.vendorId !== 0x1209 ||
      this.device.productId !== 1 ||
      ![0x0200, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700, 0x0800].includes(
        this.version
      )
    )
      throw new Error(
        'Select a supported reader running CrossPoint DFU or X3 Escape Hatch USB Update. Spare test boards are not supported.'
      )
    try {
      await this.device.open()
      if (this.device.configuration?.configurationValue !== 1)
        await this.device.selectConfiguration(1)
      const iface = this.device.configuration.interfaces.find((i) =>
        i.alternates.some(
          (a) =>
            a.alternateSetting === 0 &&
            a.interfaceClass === 0xfe &&
            a.interfaceSubclass === 1 &&
            a.interfaceProtocol === 2
        )
      )
      if (
        !iface?.alternates.some(
          (a) =>
            a.alternateSetting === 0 &&
            a.interfaceClass === 0xfe &&
            a.interfaceSubclass === 1 &&
            a.interfaceProtocol === 2
        )
      )
        throw new Error(
          'The selected device does not expose the expected DFU interface.'
        )
      this.interfaceNumber = iface.interfaceNumber
      await this.device.claimInterface(this.interfaceNumber)
      this.claimed = true
      if (iface.alternate?.alternateSetting !== 0)
        await this.device.selectAlternateInterface(this.interfaceNumber, 0)
      // OS descriptors can be cached even after firmware stops answering.
      // GETSTATE is read-only and does not trigger a pending flash callback.
      const state = await this.read(5, 1)
      if (state[0] > 10)
        throw new Error('The updater returned an invalid DFU state.')
      this.connectedState = state[0]
    } catch (error) {
      await this.close()
      throw error
    }
  }
  cancel() {
    if (!this.manifestRequested) this.cancelled = true
  }
  checkCancel() {
    if (this.cancelled) throw new Cancelled()
  }
  async transfer(promise) {
    let timer
    const request = { ...this.lastRequest },
      started = performance.now()
    const name =
      request.direction === 'in'
        ? request.request === 3
          ? 'DFU GETSTATUS'
          : request.request === 5
            ? 'DFU GETSTATE'
            : 'USB read'
        : request.request === 6
          ? 'DFU ABORT'
          : request.length === 0
            ? 'DFU finish'
            : request.value === 0
              ? 'Firmware header'
              : `Firmware block ${request.value}`
    try {
      const result = await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.usable = false
            void this.device.close().catch(() => {})
            reject(
              new Error(
                'USB stopped responding. Reconnect the reader and return to USB Firmware Update before trying again.'
              )
            )
          }, this.timeoutMs)
        }),
      ])
      this.trace.push({
        ...request,
        ms: performance.now() - started,
        status: result.status,
      })
      return result
    } catch (cause) {
      this.trace.push({
        ...request,
        ms: performance.now() - started,
        error: cause.message,
      })
      const error = new Error(`${name} failed: ${cause.message}`)
      error.failedRequest = request
      throw error
    } finally {
      clearTimeout(timer)
      if (this.trace.length > 24) this.trace.splice(0, this.trace.length - 24)
    }
  }
  setup(request, value = 0) {
    return {
      requestType: 'class',
      recipient: 'interface',
      request,
      value: value & 65535,
      index: this.interfaceNumber,
    }
  }
  async out(request, value = 0, data = new Uint8Array()) {
    if (!this.usable) throw new Error('The USB connection was lost.')
    this.lastRequest = {
      direction: 'out',
      request,
      value: value & 65535,
      length: data.byteLength,
    }
    const result = await this.transfer(
      this.device.controlTransferOut(this.setup(request, value), data)
    )
    if (result.status !== 'ok' || result.bytesWritten !== data.byteLength) {
      const error = new Error(
        `USB write failed (${result.status}, ${result.bytesWritten}/${data.byteLength} bytes).`
      )
      error.failedRequest = { ...this.lastRequest }
      throw error
    }
  }
  async read(request, length) {
    this.lastRequest = { direction: 'in', request, value: 0, length }
    const result = await this.transfer(
      this.device.controlTransferIn(this.setup(request), length)
    )
    if (result.status !== 'ok' || result.data?.byteLength !== length) {
      const error = new Error(`Incomplete DFU reply for request ${request}.`)
      error.failedRequest = { ...this.lastRequest }
      throw error
    }
    return new Uint8Array(result.data.buffer, result.data.byteOffset, length)
  }
  async status(wanted) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const b = await this.read(3, 6)
      const pollMs = b[1] | (b[2] << 8) | (b[3] << 16)
      this.lastStatus = { status: b[0], state: b[4], pollMs }
      if (b[0]) {
        const error = new Error(
          `The reader rejected the update (DFU error ${b[0]}). Installation was not confirmed.`
        )
        error.dfuStatus = b[0]
        throw error
      }
      if (b[4] === wanted) return
      if (![4, 7].includes(b[4]) || pollMs > 180000)
        throw new Error(`Unexpected DFU state ${b[4]} or wait time.`)
      this.onEvent({
        phase: this.manifestRequested ? 'verify' : 'busy',
        pollMs,
      })
      // Honor the complete advertised storage interval even if cancellation
      // was requested; issuing ABORT while flash is busy can lose that request.
      await this.wait(Math.max(2, pollMs))
    }
    throw new Error('The reader did not finish its DFU operation.')
  }
  async download(block, data) {
    await this.out(1, block, data)
    await this.status(5)
  }
  async flash(image, { expectedHash, onProgress = () => {} } = {}) {
    if (this.running) throw new Error('An update is already running.')
    this.running = true
    this.cancelled = false
    this.manifestRequested = false
    let started = false
    const report = {
      ok: false,
      deviceVersion: this.version,
      imageBytes: image.length,
      phase: 'prepare',
    }
    const start = performance.now()
    try {
      const valid = await validateImage(image, expectedHash, this.model)
      this.checkCancel()
      report.sha256 = valid.sha256
      // updater6 cannot reliably allocate both 32 KiB decoder buffers on the
      // X3. Default to its supported raw/direct-flash path until a lower-memory
      // firmware decoder has been measured on hardware. Opt-in is for tests.
      const compressed = this.version === 0x0600 && this.compress
      const wire = compressed
        ? await encodeImage(
            image,
            (p) => onProgress({ phase: 'prepare', fraction: p }),
            () => this.cancelled
          )
        : image
      this.checkCancel()
      report.wireBytes = wire.length
      report.compressed = compressed
      const header = new Uint8Array(64)
      header.set(encoder.encode(compressed ? 'X3DFU002' : 'X3DFU001'))
      const view = new DataView(header.buffer)
      view.setUint32(8, wire.length, true)
      header.set(valid.sha, 12)
      if (compressed) view.setUint32(44, image.length, true)
      report.phase = 'header'
      started = true
      onProgress({ phase: 'header' })
      await this.out(6)
      await this.status(2)
      this.checkCancel()
      await this.download(0, header)
      const transferStart = performance.now()
      report.phase = 'transfer'
      for (
        let offset = 0, block = 1;
        offset < wire.length;
        offset += this.blockSize, block++
      ) {
        this.checkCancel()
        report.pendingBlock = block & 65535
        await this.download(
          block,
          wire.subarray(offset, offset + this.blockSize)
        )
        report.acknowledgedBytes = Math.min(
          offset + this.blockSize,
          wire.length
        )
        onProgress({
          phase: 'transfer',
          fraction: report.acknowledgedBytes / wire.length,
          bytes: report.acknowledgedBytes,
          total: wire.length,
          seconds: (performance.now() - transferStart) / 1000,
        })
      }
      report.transferSeconds = (performance.now() - transferStart) / 1000
      this.checkCancel()
      // Once manifestation starts a failure/disconnect is ambiguous: never
      // ABORT or report success until the final idle status is acknowledged.
      this.manifestRequested = true
      report.phase = 'verify'
      onProgress({ phase: 'verify' })
      await this.out(1, 1 + Math.ceil(wire.length / this.blockSize))
      await this.status(2)
      report.ok = true
      report.phase = 'complete'
      onProgress({ phase: 'complete' })
    } catch (error) {
      if (error.dfuStatus === 3 && report.phase === 'header')
        error.message =
          'The reader could not prepare its transfer buffer. No firmware data was sent. ' +
          (this.version >= 0x0700
            ? 'Unplug and reconnect the reader, then reconnect here.'
            : 'Press Back on the reader, reopen USB Firmware Update, then reconnect here.')
      report.error = error.message
      report.lastStatus = this.lastStatus
      report.failedRequest = error.failedRequest || this.lastRequest
      if (started && !this.manifestRequested && this.usable) {
        try {
          await this.out(6)
          report.abortSent = true
        } catch {
          report.abortSent = false
        }
      }
      error.report = report
      throw error
    } finally {
      report.seconds = (performance.now() - start) / 1000
      report.usbTrace = this.trace.slice()
      this.running = false
      this.report = report
    }
    return report
  }
  async close() {
    try {
      if (this.device.opened && this.claimed)
        await this.device.releaseInterface(this.interfaceNumber)
    } catch {}
    this.claimed = false
    try {
      if (this.device.opened) await this.device.close()
    } catch {}
  }
}
