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
