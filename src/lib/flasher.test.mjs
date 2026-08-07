import assert from 'node:assert/strict'
import test from 'node:test'

import {
  X4_PRO_PARTITION_TABLE,
  buildPartitionTableBinary,
  parsePartitionTable,
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
