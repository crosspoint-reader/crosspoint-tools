import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

import {
  CROSSPOINT_PARTITION_TABLE,
  CrossPointFlasher,
  X4_PRO_PARTITION_TABLE,
  buildPartitionTableBinary,
  parsePartitionTable,
  pickBootAppPartition,
} from './flasher.js'

const FACTORY_X4_PRO_PARTITIONS = [
  { type: 'data-nvs', offset: 0x9000, size: 0x5000 },
  { type: 'data-ota', offset: 0xe000, size: 0x2000 },
  { type: 'app-ota_0', offset: 0x10000, size: 0x7e0000 },
  { type: 'app-ota_1', offset: 0x7f0000, size: 0x7e0000 },
  { type: 'data-spiffs', offset: 0xfd0000, size: 0x14000 },
  { type: 'data-coredump', offset: 0xfe4000, size: 0x1c000 },
]

test('X4 Pro repair layout matches the factory partition table', () => {
  assert.deepEqual(X4_PRO_PARTITION_TABLE, FACTORY_X4_PRO_PARTITIONS)

  const binary = buildPartitionTableBinary(X4_PRO_PARTITION_TABLE)
  assert.deepEqual(parsePartitionTable(binary), FACTORY_X4_PRO_PARTITIONS)
  assert.equal(
    Buffer.from(binary.subarray(0xc0, 0xe0)).toString('hex'),
    'ebebffffffffffffffffffffffffffffcdf6c703ad3f5cfd62194feec63a1c58'
  )
})

test('X4 Pro factory OTA slots fit the current stock image', () => {
  const stockFirmwareSize = 6_792_544
  const otaSlots = X4_PRO_PARTITION_TABLE.filter((partition) => partition.type.startsWith('app-ota_'))

  assert.equal(otaSlots.length, 2)
  for (const slot of otaSlots) assert.ok(slot.size >= stockFirmwareSize)
})

// Otadata with one entry (sector 0) holding `seq`; CRC32-LE of the seq bytes.
function otadataWithSeq(seq) {
  const data = new Uint8Array(0x2000).fill(0xff)
  const view = new DataView(data.buffer)
  view.setUint32(0, seq, true)
  view.setUint32(0x18, 2, true) // VALID
  view.setUint32(0x1c, crc32Le(seq), true)
  return data
}
function crc32Le(seq) {
  let crc = 0 // IDF crc32_le(UINT32_MAX, ...) = standard init 0 here
  for (const byte of [seq & 0xff, (seq >>> 8) & 0xff, (seq >>> 16) & 0xff, seq >>> 24]) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

test('app-only flash targets the partition the bootloader boots', () => {
  const pt = FACTORY_X4_PRO_PARTITIONS
  assert.equal(pickBootAppPartition(pt, new Uint8Array(0x2000).fill(0xff)).type, 'app-ota_0')
  assert.equal(pickBootAppPartition(pt, otadataWithSeq(1)).type, 'app-ota_0')
  assert.equal(pickBootAppPartition(pt, otadataWithSeq(2)).type, 'app-ota_1')
  assert.equal(pickBootAppPartition(pt, null).type, 'app-ota_0')

  // BOOX Picco stock layout: factory = vendor safeboot recovery, never written.
  const picco = [
    { type: 'data-nvs', offset: 0x9000, size: 0xc000 },
    { type: 'data-ota', offset: 0x15000, size: 0x2000 },
    { type: 'app-factory', offset: 0x20000, size: 0xc0000 },
    { type: 'app-ota_0', offset: 0xe0000, size: 0xe70000 },
    { type: 'data-spiffs', offset: 0xf50000, size: 0x80000 },
    { type: 'data-coredump', offset: 0xfd0000, size: 0x10000 },
  ]
  for (const ota of [new Uint8Array(0x2000).fill(0xff), otadataWithSeq(1), otadataWithSeq(2), null]) {
    assert.deepEqual(pickBootAppPartition(picco, ota), picco[3])
  }
  assert.equal(pickBootAppPartition([picco[2]]).type, 'app-factory')

  assert.throws(() => pickBootAppPartition([{ type: 'data-nvs', offset: 0x9000, size: 0x5000 }]))
  assert.throws(() => pickBootAppPartition([{ type: 'app-factory', offset: 0x0, size: 0x100000 }]))
})

test('boot-region install verifies the partition table by MD5, without a bulk read', async () => {
  const run = async (corrupt) => {
    const flash = new Map()
    const flasher = new CrossPointFlasher({})
    flasher.connect = async () => {
      flasher.espLoader = {
        writeFlash: async ({ fileArray }) => {
          for (const f of fileArray) flash.set(f.address, corrupt ? f.data.map((b) => b ^ 1) : f.data)
        },
        flashMd5sum: async (addr, size) =>
          createHash('md5').update(flash.get(addr).subarray(0, size)).digest('hex'),
        toHex: (b) => Buffer.from(b).toString('hex'),
        readFlash: async () => { throw new Error('bulk read must not be used') },
      }
    }
    flasher.disconnect = async () => {}
    return flasher.repairBootRegion(CROSSPOINT_PARTITION_TABLE)
  }

  const { partitions } = await run(false)
  assert.deepEqual(partitions, parsePartitionTable(buildPartitionTableBinary(CROSSPOINT_PARTITION_TABLE)))
  await assert.rejects(run(true), /did not verify/)
})

// Fake esptool-js loader whose transport replays `packets` (data packets, then
// the stub's MD5 digest) and records what the flasher sends back.
function fakeReadFlashLoader(packets) {
  const queue = [...packets]
  const loader = {
    ESP_READ_FLASH: 0xd2,
    commands: [],
    acks: [],
    _intToByteArray: (i) => new Uint8Array([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >>> 24) & 0xff]),
    _appendArray: (a, b) => {
      const out = new Uint8Array(a.length + b.length)
      out.set(a)
      out.set(b, a.length)
      return out
    },
    toHex: (b) => Buffer.from(b).toString('hex'),
    checkCommand: async (desc, op, data) => { loader.commands.push({ op, data: [...new Uint32Array(data.buffer)] }) },
    readFlash: async () => { throw new Error('esptool-js readFlash must not be used') },
    transport: {
      read: async (timeout) => {
        if (!queue.length) throw new Error(`No serial data received. (timeout ${timeout})`)
        return queue.shift()
      },
      write: async (data) => { loader.acks.push(new DataView(data.buffer).getUint32(0, true)) },
    },
  }
  return loader
}

const md5Of = (data) => new Uint8Array(createHash('md5').update(data).digest())
const flashBytes = (size) => Uint8Array.from({ length: size }, (_, i) => (i * 7 + 3) & 0xff)
const splitPackets = (data, size) => {
  const out = []
  for (let i = 0; i < data.length; i += size) out.push(data.subarray(i, i + size))
  return out
}

test('readFlash requests 256-byte packets, one in flight, and acks each one', async () => {
  const data = flashBytes(0x1000)
  const loader = fakeReadFlashLoader([...splitPackets(data, 256), md5Of(data)])
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = loader
  const progress = []

  const result = await flasher.readFlash(0x8000, 0x1000, (_, received, total) => progress.push([received, total]))

  assert.deepEqual(result, data)
  assert.deepEqual(loader.commands, [{ op: 0xd2, data: [0x8000, 0x1000, 256, 1] }])
  assert.deepEqual(loader.acks, Array.from({ length: 16 }, (_, i) => (i + 1) * 256))
  assert.deepEqual(progress.at(-1), [0x1000, 0x1000])
  assert.equal(progress.length, 16)
})

test('readFlash skips empty packets', async () => {
  const data = flashBytes(512)
  const [a, b] = splitPackets(data, 256)
  const loader = fakeReadFlashLoader([a, new Uint8Array(0), b, md5Of(data)])
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = loader

  assert.deepEqual(await flasher.readFlash(0, 512), data)
  assert.deepEqual(loader.acks, [256, 512])
})

test('readFlash rejects data that does not match the stub MD5', async () => {
  const data = flashBytes(512)
  const corrupted = data.slice()
  corrupted[100] ^= 0xff
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = fakeReadFlashLoader([...splitPackets(corrupted, 256), md5Of(data)])

  await assert.rejects(flasher.readFlash(0x8000, 512), /MD5 mismatch reading flash at 0x8000/)
})

test('readFlash rejects more data than requested', async () => {
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = fakeReadFlashLoader([flashBytes(300)])

  await assert.rejects(flasher.readFlash(0x8000, 256), /more data than requested/)
})

test('readFlash fails when the device stops sending instead of hanging', async () => {
  // Bytes lost mid-transfer: the transport's per-packet timeout must surface.
  const data = flashBytes(0x1000)
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = fakeReadFlashLoader(splitPackets(data, 256).slice(0, 5))

  await assert.rejects(flasher.readFlash(0x8000, 0x1000), /No serial data received\. \(timeout 3000\)/)
})

test('partition table and app-only flash reads go through readFlash', async () => {
  const table = buildPartitionTableBinary(CROSSPOINT_PARTITION_TABLE)
  const pt = new Uint8Array(0x1000).fill(0xff)
  pt.set(table)
  const flasher = new CrossPointFlasher({})
  flasher.espLoader = fakeReadFlashLoader([...splitPackets(pt, 256), md5Of(pt)])

  await flasher.readLayout()

  assert.deepEqual(flasher.espLoader.commands[0].data, [0x8000, 0x1000, 256, 1])
  assert.ok(flasher.layout.appSlots.length >= 1)
})
