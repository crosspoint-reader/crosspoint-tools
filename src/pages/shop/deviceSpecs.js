// Hardware specs for the /devices filters and compare table, keyed by the
// device's shop id (see /admin → shop items). A device without an entry still
// lists, but drops out as soon as a filter is applied.
//
// Source: "CrossPoint device comparison" sheet, 24 Sep 2026 (manufacturer specs
// take priority), with gaps filled from the FreeInk SDK docs where noted.
// null = unknown (renders "?"), false = confirmed absent.
//
// Fields: screen (in), resolution [w, h] portrait px, ppi, frontlight
// ('none' | 'white' | 'warm-cool'), touch, frontButtons, sideButtons,
// homeButton, gyro, rtc,
// connectors ['usb-c' | 'pogo'], mcu, psram (MB external), battery (mAh), weight (g), price (USD snapshot).
const SPECS = {
  // Xteink X4 Pro. RTC from SDK xteink-x4pro-support.md.
  'acc-mrtxq1dy': {
    screen: 4.3, resolution: [480, 800], ppi: 219, frontlight: 'warm-cool',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: null, rtc: true,
    connectors: ['pogo'], mcu: 'ESP32-S3', psram: 8,
    battery: 1100, weight: 72, price: 99,
  },
  // Xteink X4C ("X4 Classic" in the sheet). IMU/RTC from SDK xteink-x4c-support.md.
  'acc-mtqqu599': {
    screen: 4.3, resolution: [480, 800], ppi: 219, frontlight: 'none',
    touch: false, frontButtons: true, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['pogo'], mcu: 'ESP32-S3', psram: 8,
    battery: 920, weight: 68, price: 79,
  },
  // Xteink X3. RTC from SDK BoardConfig.h.
  'acc-mrtxglf8': {
    screen: 3.7, resolution: [528, 792], ppi: 259, frontlight: 'none',
    touch: false, frontButtons: true, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['pogo'], mcu: 'ESP32-C3', psram: 0,
    battery: 650, weight: 58, price: 69,
  },
  // Seeed reTerminal Sticky. RTC from SDK BoardConfig.h.
  'acc-mrtxyjaa': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'none',
    touch: true, frontButtons: false, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 2000, weight: 70, price: 49.9,
  },
  // M5Stack M5PaperMono. SDK's M5Pm1.h says 1250 mAh; sheet (manufacturer) wins.
  'acc-mt2l0zec': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'white',
    touch: true, frontButtons: null, sideButtons: true, homeButton: null, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1150, weight: 74.7, price: 65,
  },
  // BOOX Picco
  'acc-muknw3sl': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'warm-cool',
    touch: true, frontButtons: null, sideButtons: true, homeButton: true, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 920, weight: 58, price: 99.99,
  },
  // LilyGo T5 E-Paper S3 Pro Lite. Sheet column is the full T5 S3 Pro; PPI computed.
  'acc-mrtxg29l': {
    screen: 4.7, resolution: [540, 960], ppi: 234, frontlight: 'white',
    touch: true, frontButtons: null, sideButtons: null, homeButton: true, gyro: null, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1500, weight: null, price: 84.21,
  },
  // M5Stack M5Paper v1.1. Not in the sheet; SDK BoardConfig.h only, which
  // doesn't cover battery, connector, RTC or IMU. Classic ESP32, but the board
  // carries 8 MB PSRAM (BoardConfig.h:329).
  'acc-mrty1g0m': {
    screen: 4.7, resolution: [540, 960], ppi: 234, frontlight: 'none',
    touch: true, frontButtons: null, sideButtons: null, homeButton: null, gyro: null, rtc: null,
    connectors: null, mcu: 'ESP32', psram: 8,
    battery: null, weight: null, price: null,
  },
}

export function specFor(item) {
  return SPECS[item.id] || null
}
