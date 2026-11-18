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
// connectors ['usb-c' | 'pogo'], mcu, psram (MB external), battery (mAh), weight (g, or a string like '100+' when only a floor is known), price (USD snapshot).
const SPECS = {
  // Xteink X4 Pro. RTC from SDK xteink-x4pro-support.md.
  'acc-mrtxq1dy': {
    screen: 4.3, resolution: [480, 800], ppi: 219, frontlight: 'warm-cool',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: false, rtc: true,
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
    touch: true, frontButtons: false, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1150, weight: 74.7, price: 65,
  },
  // M5Stack PaperMono Lite: PaperMono minus NFC/LoRa (M5Stack shop spec table:
  // same panel, FT6336G touch, frontlight, BMI270, RX8130CE, 1150 mAh, 72.4 g).
  'acc-mvcnlvue': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'white',
    touch: true, frontButtons: false, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1150, weight: 72.4, price: 55,
  },
  // BOOX Picco
  'acc-muknw3sl': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'warm-cool',
    touch: true, frontButtons: false, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 920, weight: 58, price: 99.99,
  },
  // LilyGo T5 E-Paper S3 Pro Lite. Same board as the full Pro minus GPS/LoRa
  // (github.com/Xinyuan-LilyGO/T5S3-4.7-e-paper-PRO); no IMU on the I2C bus.
  // Price from lilygo.cc; PPI computed.
  'acc-mrtxg29l': {
    screen: 4.7, resolution: [540, 960], ppi: 234, frontlight: 'white',
    touch: true, frontButtons: false, sideButtons: false, homeButton: true, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1500, weight: '100+', price: 71.31,
  },
  // M5Stack M5Paper v1.1. Not in the sheet: docs.m5stack.com/en/core/m5paper_v1.1
  // and the M5Stack shop (side dial wheel, BM8563 RTC, no IMU). Classic ESP32,
  // but the board carries 8 MB PSRAM (SDK BoardConfig.h:329).
  'acc-mrty1g0m': {
    screen: 4.7, resolution: [540, 960], ppi: 234, frontlight: 'none',
    touch: true, frontButtons: false, sideButtons: true, homeButton: false, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32', psram: 8,
    battery: 1150, weight: 81.6, price: 85,
  },
  // EEGOREAD A4. Not in the sheet: eegoread.com spec table (3.98", 238 PPI,
  // warm & cool light, RTC, 84 g). N16R8 + no IMU from SDK eego-a4-support.md.
  // Home = the capacitive screen key (short press Back, hold Home).
  'acc-mvcmt9iy': {
    screen: 3.98, resolution: [552, 768], ppi: 238, frontlight: 'warm-cool',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 2000, weight: 84, price: 85.99,
  },
  // EEGOREAD A4 Lite: same board as the A4, no frontlight, 78 g.
  'acc-mvcmuwo4': {
    screen: 3.98, resolution: [552, 768], ppi: 238, frontlight: 'none',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 2000, weight: 78, price: 65.99,
  },
  // Metalio E-Ink 4. Not in the sheet: Amazon listing B0HR7DW14F (3.97", 235 PPI,
  // 70 g, 1000 mAh, $88.99). No frontlight, N16R8, PCF8563 RTC, SC7A20H
  // accelerometer (no gyro, so gyro: false) from SDK metalio-eink4-support.md. Side = volume +/-;
  // Home = the capacitive cover key. USB-C on both Metalio devices per the site owner.
  'acc-mwmglkib': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'none',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1000, weight: 70, price: 88.99,
  },
  // Metalio E-Ink 4 Plus. Amazon listing B0HR7W5LFS (4.7", 684×1216, 297 PPI,
  // 2000 mAh, 100 g, $118.99). ESP32-S31 with 16 MB PSRAM, warm/cool
  // frontlight, PCF8563 RTC, SC7A20H accelerometer (no gyro), USB-C from SDK
  // branch feat/metalio-eink4-plus-s31, metalio-eink4-plus-support.md.
  // Side = volume +/-; Home = the capacitive bezel key.
  'acc-mwmgkmze': {
    screen: 4.7, resolution: [684, 1216], ppi: 297, frontlight: 'warm-cool',
    touch: true, frontButtons: false, sideButtons: true, homeButton: true, gyro: false, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S31', psram: 16,
    battery: 2000, weight: 100, price: 118.99,
  },
  // Waveshare ESP32-S3-ePaper-3.97 with battery (Waveshare SKU 33552).
  'acc-mwmkhguc': {
    screen: 3.97, resolution: [480, 800], ppi: 235, frontlight: 'none',
    touch: false, frontButtons: false, sideButtons: true, homeButton: false, gyro: true, rtc: true,
    connectors: ['usb-c'], mcu: 'ESP32-S3', psram: 8,
    battery: 1500, weight: 108, price: 35,
  },
}

export function specFor(item) {
  return SPECS[item.id] || null
}
