import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingDfuDevices, shouldUseDfu, chooseReaderConnection } from './dfu-discovery.js'
const c3 = { vendorId: 0x1209, productId: 1, deviceVersionMajor: 7, deviceVersionMinor: 0, deviceVersionSubminor: 0 }
const pro = { ...c3, deviceVersionMajor: 8 }
test('automatic detection matches the selected chip family and excludes test devices', () => {
  const devices = [c3, pro, { ...c3, deviceVersionSubminor: 1 }, { ...c3, vendorId: 0x303a }]
  assert.deepEqual(matchingDfuDevices(devices, 'x3'), [c3])
  assert.deepEqual(matchingDfuDevices(devices, 'x4'), [c3])
  assert.deepEqual(matchingDfuDevices(devices, 'x4pro'), [pro])
  assert.deepEqual(matchingDfuDevices(devices, 'x4c'), [])
  assert.deepEqual(matchingDfuDevices(devices, null), [])
  assert.deepEqual(matchingDfuDevices([], 'x3'), [])
})

test('Flash uses the USB picker before first permission; serial is explicit fallback', () => {
  for (const model of ['x3', 'x4', 'x4pro']) {
    assert.equal(shouldUseDfu(model, 'auto', true), true)
    assert.equal(shouldUseDfu(model, 'serial', true), false)
    assert.equal(shouldUseDfu(model, 'auto', false), false)
  }
  assert.equal(shouldUseDfu('x4c', 'auto', true), false)
})

test('first connection picker includes both DFU and regular Espressif USB', async () => {
  const usb = { requestDevice: async ({ filters }) => {
    assert(filters.some(f => f.vendorId === 0x303a && f.productId === 0x1001))
    assert(filters.some(f => f.vendorId === 0x1209 && f.productId === 1))
    return c3
  } }
  const result = await chooseReaderConnection({ model: 'x3', usb, serial: { getPorts: async () => [] } })
  assert.equal(result.dfuDevice, c3)
})
test('regular unlocked reader reuses an authorized serial port without a USB picker', async () => {
  const port = { getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }) }
  const result = await chooseReaderConnection({ model: 'x4pro', usb: { requestDevice: () => { throw Error('wrong picker') } }, serial: { getPorts: async () => [port] } })
  assert.equal(result.serialPort, port)
})
test('new regular reader requests serial permission continuation, not DFU', async () => {
  let serialPrompts = 0
  const serial = { getPorts: async () => [], requestPort: async () => { serialPrompts++; return 'port' } }
  const usb = { requestDevice: async () => ({ vendorId: 0x303a, productId: 0x1001 }) }
  assert.deepEqual(await chooseReaderConnection({ model: 'x4pro', usb, serial }), { needsSerialPermission: true })
  assert.equal(serialPrompts, 0)
  assert.deepEqual(await chooseReaderConnection({ model: 'x4pro', usb, serial, forceSerial: true }), { serialPort: 'port' })
  assert.equal(serialPrompts, 1)
})
test('wrong DFU model is rejected before any serial permission or flash', async () => {
  await assert.rejects(chooseReaderConnection({ model: 'x3', usb: { requestDevice: async () => pro } }), /does not match/)
})
test('multiple authorized transports still require explicit device selection', async () => {
  const serial = { getPorts: async () => [{ getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }) }] }
  let prompts = 0
  const usb = { requestDevice: async () => { prompts++; return c3 } }
  const result = await chooseReaderConnection({ model: 'x3', usb, serial, authorizedUsb: [c3] })
  assert.equal(result.dfuDevice, c3)
  assert.equal(prompts, 1)
})

test('USB-paired serial device opens serial permission rather than repeating USB pairing', async () => {
  const usb = { requestDevice: () => { throw Error('USB picker repeated') } }
  const serial = { getPorts: async () => [], requestPort: async () => 'serial-port' }
  const result = await chooseReaderConnection({ model: 'x4pro', usb, serial,
    authorizedUsb: [{ vendorId: 0x303a, productId: 0x1001 }] })
  assert.deepEqual(result, { serialPort: 'serial-port' })
})
