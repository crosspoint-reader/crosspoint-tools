import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { validateImage, encodeImage, DfuClient, Cancelled } from './dfu.js'
const hash = async (b) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', b))
const image = await synthetic()
async function synthetic({ chip = 5, board = 'x4', hashed = true } = {}) {
  const b = new Uint8Array(65584 + (hashed ? 32 : 0)),
    v = new DataView(b.buffer)
  b[0] = 0xe9
  b[1] = 1
  v.setUint16(12, chip, true)
  b[23] = hashed ? 1 : 0
  v.setUint32(28, 65536, true)
  b.set(new TextEncoder().encode(`CROSSPOINT-BOARD-V1:${board};`), 40)
  let xor = 0xef
  for (let i = 32; i < 65568; i++) xor ^= b[i]
  b[65583] = xor
  if (hashed) b.set(await hash(b.subarray(0, 65584)), 65584)
  return b
}
function unpack(wire) {
  const pieces = []
  for (let i = 0; i < wire.length; ) {
    const v = new DataView(wire.buffer, wire.byteOffset + i),
      field = v.getUint32(0, true),
      size = field & 0x7fffffff,
      rawSize = v.getUint32(4, true)
    assert(size > 0 && size <= 32760 && rawSize <= 32760)
    const payload = wire.subarray(i + 8, i + 8 + size),
      raw = field >>> 31 ? payload : inflateSync(payload)
    assert.equal(raw.length, rawSize)
    pieces.push(raw)
    const recordSize = Math.max(8192, Math.ceil((8 + size) / 4096) * 4096)
    assert(wire.subarray(i + 8 + size, i + recordSize).every((b) => b === 0))
    i += recordSize
  }
  return Buffer.concat(pieces)
}
class Device {
  constructor(version = 6) {
    this.vendorId = 0x1209
    this.productId = 1
    this.deviceVersionMajor = version
    this.deviceVersionMinor = 0
    this.deviceVersionSubminor = 0
    this.opened = false
    this.configuration = null
    this.calls = []
    this.state = 2
    this.next = 0
    this.received = 0
    this.failData = false
    this.failManifest = false
    this.busy = true
  }
  async open() {
    this.opened = true
  }
  async selectConfiguration(n) {
    this.configuration = {
      configurationValue: n,
      interfaces: [
        {
          interfaceNumber: 0,
          alternate: { alternateSetting: 0 },
          alternates: [
            {
              alternateSetting: 0,
              interfaceClass: 0xfe,
              interfaceSubclass: 1,
              interfaceProtocol: 2,
            },
          ],
        },
      ],
    }
  }
  async claimInterface(n) {
    assert.equal(n, 0)
    this.claimed = true
  }
  async releaseInterface() {
    this.claimed = false
  }
  async close() {
    this.opened = false
  }
  async controlTransferOut(s, b) {
    assert(this.opened && this.claimed)
    assert.equal(s.requestType, 'class')
    assert.equal(s.recipient, 'interface')
    assert.equal(s.index, 0)
    this.calls.push({ request: s.request, value: s.value, data: b.slice() })
    if (s.request === 6) {
      this.state = 2
      this.next = 0
      this.received = 0
      return { status: 'ok', bytesWritten: 0 }
    }
    assert.equal(s.request, 1)
    assert.equal(s.value, this.next & 65535)
    if (this.failData && s.value === 1)
      return { status: 'stall', bytesWritten: 0 }
    if (!b.length) {
      assert.equal(this.received, this.total)
      this.state = 7
      this.final = true
      if (this.failManifest)
        throw new Error('Disconnected during manifestation')
    } else if (this.next === 0) {
      assert.equal(b.length, 64)
      this.header = b
      this.total = new DataView(b.buffer).getUint32(8, true)
      this.state = 4
    } else {
      this.received += b.length
      this.state = 4
    }
    this.next++
    return { status: 'ok', bytesWritten: b.length }
  }
  async controlTransferIn(s, n) {
    if (s.request === 5) {
      assert.equal(n, 1)
      return {
        status: 'ok',
        data: new DataView(Uint8Array.of(this.state).buffer),
      }
    }
    assert.equal(s.request, 3)
    assert.equal(n, 6)
    this.calls.push({ request: 3 })
    const b = new Uint8Array(6)
    b[4] = this.state
    b[1] = this.state === 7 ? 9 : 2
    if (this.verifyError && this.final) b[0] = 7
    const returned = this.state
    if (returned === 4) this.state = 5
    if (returned === 7) this.state = 2
    return { status: 'ok', data: new DataView(b.buffer) }
  }
}
const immediate = { wait: async () => {} }
test('bad chip, board, checksum, SHA, merged image and pinned hash rejected', async () => {
  await assert.rejects(validateImage(await synthetic({ chip: 9 })), /ESP32-C3/)
  await assert.rejects(
    validateImage(await synthetic({ board: 'sticky' })),
    /sticky/
  )
  let bad = await synthetic()
  bad[100] ^= 1
  await assert.rejects(validateImage(bad), /checksum/)
  bad = await synthetic()
  bad[bad.length - 1] ^= 1
  await assert.rejects(validateImage(bad), /SHA-256/)
  bad = new Uint8Array(image.length + 65536)
  bad.set(image)
  await assert.rejects(validateImage(bad), /app-only/)
  await assert.rejects(validateImage(image, '0'.repeat(64)), /expected SHA/)
  bad = await synthetic()
  new DataView(bad.buffer).setUint32(28, 0xffffffff, true)
  await assert.rejects(validateImage(bad), /past the end/)
})
test('browser CompressionStream records round-trip full CrossPoint and raw fallback', async () => {
  const wire = await encodeImage(image)
  assert.deepEqual(unpack(wire), Buffer.from(image))
  assert(wire.length < image.length)
  assert.equal(wire.length % 4096, 0)
  if (process.env.X3_TEST_WIRE_OUTPUT)
    await writeFile(process.env.X3_TEST_WIRE_OUTPUT, wire)
  const random = new Uint8Array(70000)
  crypto.getRandomValues(random.subarray(0, 65536))
  crypto.getRandomValues(random.subarray(65536))
  assert.deepEqual(unpack(await encodeImage(random)), Buffer.from(random))
})
test('compressed success uses metadata/raw SHA, 4096-byte data and final idle confirmation', async () => {
  const dev = new Device(),
    waits = [],
    client = new DfuClient(dev, {
      compress: true,
      wait: async (ms) => waits.push(ms),
    })
  await client.connect()
  const raw = await synthetic()
  const report = await client.flash(raw)
  assert(report.ok && report.compressed)
  assert.equal(new TextDecoder().decode(dev.header.subarray(0, 8)), 'X3DFU002')
  assert.equal(new DataView(dev.header.buffer).getUint32(44, true), raw.length)
  assert.deepEqual(dev.header.subarray(12, 44), await hash(raw))
  assert(waits.includes(9))
  assert(
    dev.calls
      .filter((c) => c.request === 1 && c.data.length > 64)
      .every((c) => c.data.length === 4096)
  )
  await client.close()
  assert(!dev.opened)
})
test('updater5 sends raw bytes and updater2 handles 16-bit block wrap', async () => {
  for (const version of [5, 2]) {
    const dev = new Device(version),
      client = new DfuClient(dev, immediate)
    await client.connect()
    const report = await client.flash(version === 2 ? image : await synthetic())
    assert(report.ok && !report.compressed)
    assert.equal(
      new TextDecoder().decode(dev.header.subarray(0, 8)),
      'X3DFU001'
    )
  }
})
test('reject wrong device/test identity before opening', async () => {
  const dev = new Device()
  dev.deviceVersionSubminor = 1
  const client = new DfuClient(dev, immediate)
  await assert.rejects(client.connect(), /Spare/)
  assert(!dev.opened)
})
test('validation failure sends no USB writes', async () => {
  const dev = new Device(),
    client = new DfuClient(dev, immediate)
  await client.connect()
  await assert.rejects(client.flash(new Uint8Array(65536)))
  assert.equal(dev.calls.length, 0)
})
test('failed data block is not retried and never manifests', async () => {
  const dev = new Device()
  dev.failData = true
  const client = new DfuClient(dev, immediate)
  await client.connect()
  await assert.rejects(client.flash(await synthetic()), /USB write failed/)
  assert.equal(
    dev.calls.filter((c) => c.request === 1 && c.value === 1).length,
    1
  )
  assert(!dev.final)
  assert.equal(dev.calls.at(-1).request, 6)
})
test('cancel at acknowledged boundary aborts without finalization', async () => {
  const dev = new Device(),
    client = new DfuClient(dev, immediate)
  await client.connect()
  await assert.rejects(
    client.flash(await synthetic(), {
      onProgress: (e) => {
        if (e.phase === 'transfer') client.cancel()
      },
    }),
    Cancelled
  )
  assert(!dev.final)
  assert.equal(dev.calls.at(-1).request, 6)
})
test('cancel during compression does not touch USB', async () => {
  const dev = new Device(),
    client = new DfuClient(dev, { ...immediate, compress: true })
  await client.connect()
  await assert.rejects(
    client.flash(await synthetic(), {
      onProgress: (e) => {
        if (e.phase === 'prepare') client.cancel()
      },
    }),
    Cancelled
  )
  assert.equal(dev.calls.length, 0)
})
test('ambiguous manifestation failure is never aborted or called success', async () => {
  const dev = new Device()
  dev.failManifest = true
  const client = new DfuClient(dev, immediate)
  await client.connect()
  await assert.rejects(client.flash(await synthetic()), /manifestation/)
  assert(!client.report.ok)
  assert.equal(dev.calls.filter((c) => c.request === 6).length, 1)
})
test('device verification error is reported and never aborted after manifest', async () => {
  const dev = new Device()
  dev.verifyError = true
  const client = new DfuClient(dev, immediate)
  await client.connect()
  await assert.rejects(client.flash(await synthetic()), /DFU error 7/)
  assert(!client.report.ok)
  assert.equal(dev.calls.filter((c) => c.request === 6).length, 1)
})
test('a hung USB transfer closes connection and is never retried', async () => {
  const dev = new Device()
  dev.controlTransferOut = async () => new Promise(() => {})
  const client = new DfuClient(dev, { ...immediate, timeoutMs: 10 })
  await client.connect()
  await assert.rejects(client.flash(await synthetic()), /stopped responding/)
  assert(!client.usable && !dev.opened && !client.report.ok)
})

test('connect probes live DFU state rather than trusting cached OS descriptors', async () => {
  const dev = new Device()
  dev.controlTransferIn = async () => {
    throw new Error('A transfer error has occurred.')
  }
  const client = new DfuClient(dev, immediate)
  await assert.rejects(client.connect(), /DFU GETSTATE failed/)
  assert(!dev.opened)
  assert.equal(dev.calls.length, 0)
})
test('report preserves the failed initial request even if cleanup also fails', async () => {
  const dev = new Device(),
    client = new DfuClient(dev, immediate)
  await client.connect()
  dev.controlTransferOut = async () => {
    throw new Error('A transfer error has occurred.')
  }
  await assert.rejects(client.flash(await synthetic()), /DFU ABORT failed/)
  assert.deepEqual(client.report.failedRequest, {
    direction: 'out',
    request: 6,
    value: 0,
    length: 0,
  })
  assert.equal(client.report.abortSent, false)
  assert.equal(client.report.usbTrace.at(-1).request, 6)
})

test('updater6 defaults to raw transfer to avoid its large decoder allocations', async () => {
  const dev = new Device(),
    client = new DfuClient(dev, immediate)
  await client.connect()
  const raw = await synthetic(),
    report = await client.flash(raw)
  assert(report.ok && !report.compressed)
  assert.equal(report.wireBytes, raw.length)
  assert.equal(new TextDecoder().decode(dev.header.subarray(0, 8)), 'X3DFU001')
})

test('CrossPoint automatic DFU uses raw 4096-byte transfers even when compression requested', async () => {
  const dev = new Device(7),
    client = new DfuClient(dev, { ...immediate, compress: true })
  await client.connect()
  const raw = await synthetic(),
    report = await client.flash(raw)
  assert(report.ok && !report.compressed)
  assert.equal(report.wireBytes, raw.length)
  assert.equal(new TextDecoder().decode(dev.header.subarray(0, 8)), 'X3DFU001')
  assert(
    dev.calls
      .filter((c) => c.request === 1 && c.value > 0 && c.data.length)
      .every((c) => c.data.length <= 4096)
  )
})

test('X4 Pro images require S3 and matching board; X3 images stay rejected', async () => {
  const pro = await synthetic({ chip: 9, board: 'x4pro' })
  await validateImage(pro, undefined, 'x4pro')
  await assert.rejects(validateImage(pro), /ESP32-C3/)
  await assert.rejects(validateImage(image, undefined, 'x4pro'), /ESP32-S3/)
  await assert.rejects(
    validateImage(
      await synthetic({ chip: 9, board: 'x4c' }),
      undefined,
      'x4pro'
    ),
    /x4c/
  )
})
test('X4 Pro client accepts only its board and uses the discovered DFU interface', async () => {
  const dev = new Device(8)
  const originalSelect = dev.selectConfiguration.bind(dev)
  dev.selectConfiguration = async (n) => {
    await originalSelect(n)
    dev.configuration.interfaces[0].interfaceNumber = 1
  }
  dev.claimInterface = async (n) => {
    assert.equal(n, 1)
    dev.claimed = true
  }
  dev.releaseInterface = async (n) => {
    assert.equal(n, 1)
    dev.claimed = false
  }
  const originalOut = dev.controlTransferOut.bind(dev)
  dev.controlTransferOut = async (s, b) => {
    assert.equal(s.index, 1)
    return originalOut({ ...s, index: 0 }, b)
  }
  const client = new DfuClient(dev, immediate)
  await client.connect()
  const report = await client.flash(
    await synthetic({ chip: 9, board: 'x4pro' })
  )
  assert(report.ok)
  await assert.rejects(client.flash(image), /ESP32-S3/)
  await client.close()
})

test('X4 uses the shared C3 image and rejects X4 Pro images', async () => {
  await validateImage(image, undefined, 'x4')
  await validateImage(await synthetic(), undefined, 'x4')
  await assert.rejects(
    validateImage(
      await synthetic({ chip: 9, board: 'x4pro' }),
      undefined,
      'x4'
    ),
    /ESP32-C3/
  )
})


test('default pacing reports advertised and elapsed waits and resets per flash', async () => {
  const dev = new Device(7), client = new DfuClient(dev)
  await client.connect()
  const raw = await synthetic()
  const first = await client.flash(raw)
  assert(first.waitTiming.count > 0)
  assert(first.waitTiming.requestedMs > 0)
  assert(first.waitTiming.elapsedMs >= first.waitTiming.requestedMs)
  assert.equal(first.waitTimer, 'page-fallback')
  assert(first.usbTrace.some(t => t.pollMs > 0 && t.status === 'ok'))
  assert.equal(client.timer.worker, null)
  const second = await client.flash(raw)
  assert.equal(second.waitTiming.count, first.waitTiming.count)
  await client.close()
})
