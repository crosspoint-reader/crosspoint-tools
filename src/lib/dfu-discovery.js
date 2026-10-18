// getDevices() exposes only connected devices this origin is allowed to use.
export function matchingDfuDevices(devices, model) {
  if (!['x3', 'x4', 'x4pro'].includes(model)) return []
  return devices.filter(device => {
    if (device.vendorId !== 0x1209 || device.productId !== 1) return false
    const version = (device.deviceVersionMajor << 8) |
      (device.deviceVersionMinor << 4) | device.deviceVersionSubminor
    return model === 'x4pro' ? version === 0x0800 :
      [0x0200, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700].includes(version)
  })
}

// A new DFU reader is invisible to getDevices() until the user grants access.
// An empty authorized list must not silently switch Flash to a serial picker.
export function shouldUseDfu(model, transport, usbSupported) {
  return usbSupported && transport !== 'serial' && ['x3', 'x4', 'x4pro'].includes(model)
}

export const READER_USB_FILTERS = [
  { vendorId: 0x1209, productId: 1 },
  { vendorId: 0x303a, productId: 0x1001 },
]

export async function chooseReaderConnection({ model, usb, serial, authorizedUsb = [], forceSerial = false }) {
  if (forceSerial || !shouldUseDfu(model, 'auto', Boolean(usb))) {
    return { serialPort: await serial.requestPort({ filters: [{ usbVendorId: 0x303a, usbProductId: 0x1001 }] }) }
  }
  const devices = matchingDfuDevices(authorizedUsb, model)
  const ports = serial ? (await serial.getPorts()).filter(port => {
    const info = port.getInfo()
    return info.usbVendorId === 0x303a && info.usbProductId === 0x1001
  }) : []
  if (devices.length === 1 && ports.length === 0) return { dfuDevice: devices[0] }
  if (ports.length === 1 && devices.length === 0) return { serialPort: ports[0] }
  const device = await usb.requestDevice({ filters: READER_USB_FILTERS })
  if (matchingDfuDevices([device], model).length) return { dfuDevice: device }
  if (device.vendorId !== 0x303a || device.productId !== 0x1001) {
    throw new Error('The connected reader does not match the selected model or supported USB updater.')
  }
  if (!serial) throw new Error('This reader needs serial access. Use Chrome or Edge on desktop.')
  // USB permission does not grant serial permission. A new click provides the
  // user activation required by the separate browser serial permission dialog.
  return { needsSerialPermission: true }
}
