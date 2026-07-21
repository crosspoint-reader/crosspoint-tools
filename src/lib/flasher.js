/**
 * CrossPoint ESP32 Flasher: shared flashing module
 * Uses esptool-js via ESM import for WebSerial-based OTA flashing.
 */

let ESPLoader, Transport;

export async function loadEsptool() {
  if (ESPLoader) return;
  const mod = await import('./esptool.bundle.js');
  ESPLoader = mod.ESPLoader;
  Transport = mod.Transport;
}

// --- CRC32 ---

const CRC32_TABLE = new Uint32Array(256);
(function buildTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc >>> 0;
  }
})();

function crc32(data, previous = 0) {
  let crc = previous === 0 ? 0 : (previous ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// --- Byte Utilities ---

function u32ToLeBytes(val) {
  return new Uint8Array([val & 0xFF, (val >>> 8) & 0xFF, (val >>> 16) & 0xFF, (val >>> 24) & 0xFF]);
}

function leBytesToU32(bytes) {
  return ((bytes[0] || 0) + (((bytes[1] || 0) << 8) >>> 0) +
    (((bytes[2] || 0) << 16) >>> 0) + (((bytes[3] || 0) << 24) >>> 0)) >>> 0;
}

function isEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function generateCrc32Le(sequence) {
  // ESP-IDF stores crc32_le(UINT32_MAX, ota_seq, 4) in otadata entries.
  return u32ToLeBytes(crc32(u32ToLeBytes(sequence), 0xFFFFFFFF));
}

// --- MD5 ---
//
// The partition table's checksum row stores an MD5 digest and WebCrypto
// doesn't offer MD5, so this is a minimal RFC 1321 implementation.

const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function md5(input) {
  const bitLen = input.length * 8;
  const paddedLen = (Math.floor((input.length + 8) / 64) + 1) * 64;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[input.length] = 0x80;
  // 64-bit LE bit length; JS bit ops are 32-bit, so split manually.
  msg.set(u32ToLeBytes(bitLen >>> 0), paddedLen - 8);
  msg.set(u32ToLeBytes(Math.floor(bitLen / 2 ** 32)), paddedLen - 4);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) M[i] = leBytesToU32(msg.subarray(chunk + i * 4, chunk + i * 4 + 4));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  out.set(u32ToLeBytes(a0), 0);
  out.set(u32ToLeBytes(b0), 4);
  out.set(u32ToLeBytes(c0), 8);
  out.set(u32ToLeBytes(d0), 12);
  return out;
}

// --- Firmware Image Validation ---

const ESP_IMAGE_MAGIC = 0xE9;
const IMG_HEADER_SIZE = 24;
const IMG_SEG_HEADER_SIZE = 8;
const IMG_SHA_TRAILER = 32;
const IMG_CHECKSUM_SEED = 0xEF;
// header[23] bit 0 = hash_appended; default IDF builds set it.
const IMG_HASH_APPENDED_OFFSET = 23;

// Walk the ESP image structure: 24-byte header, segCount segments each with an
// 8-byte header + dataLen bytes, padding-to-16, 1-byte XOR checksum at
// padEnd - 1, optional 32-byte SHA-256 over [0, totalSize - 32). Rejects HTML
// error pages, truncated downloads, and wrong-shape binaries that would
// otherwise pass the only previous check (a length range).
//
// Headroom-first arithmetic on every bound: `totalSize - pos < N`, never
// `pos + N > totalSize`. Hostile dataLen = 0xFFFFFFFF wraps the addition form
// into "valid" and admits a 4 GB read; the subtraction form catches it.
export async function validateFirmwareImage(data) {
  const totalSize = data.length;
  if (totalSize < IMG_HEADER_SIZE) {
    throw new Error('Firmware too small: header is truncated.');
  }
  if (data[0] !== ESP_IMAGE_MAGIC) {
    throw new Error('Invalid firmware: ESP image magic byte (0xE9) missing. Are you sure this is a firmware .bin?');
  }
  const segCount = data[1];
  const hashAppended = (data[IMG_HASH_APPENDED_OFFSET] & 0x01) !== 0;

  let xorAccum = IMG_CHECKSUM_SEED;
  let pos = IMG_HEADER_SIZE;
  for (let i = 0; i < segCount; i++) {
    if (totalSize - pos < IMG_SEG_HEADER_SIZE) {
      throw new Error('Invalid firmware: segment header runs past end of file.');
    }
    const dataLen = leBytesToU32(data.subarray(pos + 4, pos + 8));
    pos += IMG_SEG_HEADER_SIZE;
    if (dataLen > totalSize - pos) {
      throw new Error('Invalid firmware: segment data runs past end of file.');
    }
    const end = pos + dataLen;
    for (let j = pos; j < end; j++) xorAccum ^= data[j];
    pos = end;
  }

  // (pos + 16) & ~15 lands in [1, 16] bytes past pos; the byte at padEnd - 1
  // holds the XOR-of-segment-data checksum.
  const padEnd = (pos + 16) & ~15;
  const expectedTotal = padEnd + (hashAppended ? IMG_SHA_TRAILER : 0);
  if (expectedTotal !== totalSize) {
    throw new Error(`Invalid firmware: declared size ${expectedTotal} does not match file size ${totalSize}.`);
  }
  const storedChecksum = data[padEnd - 1];
  if ((xorAccum & 0xFF) !== storedChecksum) {
    throw new Error(`Invalid firmware: segment checksum mismatch (computed 0x${(xorAccum & 0xFF).toString(16)}, stored 0x${storedChecksum.toString(16)}).`);
  }
  if (hashAppended) {
    const body = data.subarray(0, totalSize - IMG_SHA_TRAILER);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
    const stored = data.subarray(totalSize - IMG_SHA_TRAILER);
    if (!isEqualBytes(digest, stored)) {
      throw new Error('Invalid firmware: SHA-256 trailer mismatch. File is corrupt or truncated.');
    }
  }
}

// --- Known Partition Tables ---
//
// Reference layouts the debug page compares against. The flasher derives
// its actual offsets from the device's PT (extractLayout), so these are not
// load-bearing for OTA; they're labels used for diagnostics.

export const X4_PARTITION_TABLE = [
  { type: 'data-nvs', offset: 0x9000, size: 0x5000 },
  { type: 'data-ota', offset: 0xe000, size: 0x2000 },
  { type: 'app-ota_0', offset: 0x10000, size: 0x640000 },
  { type: 'app-ota_1', offset: 0x650000, size: 0x640000 },
  { type: 'data-spiffs', offset: 0xc90000, size: 0x360000 },
  { type: 'data-coredump', offset: 0xff0000, size: 0x10000 },
];

export const X3_PARTITION_TABLE = [
  { type: 'data-nvs', offset: 0x9000, size: 0x5000 },
  { type: 'data-ota', offset: 0xe000, size: 0x2000 },
  { type: 'app-ota_0', offset: 0x10000, size: 0x770000 },
  { type: 'app-ota_1', offset: 0x780000, size: 0x770000 },
  { type: 'data-spiffs', offset: 0xef0000, size: 0x100000 },
  { type: 'data-coredump', offset: 0xff0000, size: 0x10000 },
];

// CrossPoint's partitions.csv (all envs: sticky, m5paper, lilygo) — same
// values as the X4 layout, kept separate so non-Xteink device installs don't
// couple to X4.
export const CROSSPOINT_PARTITION_TABLE = [
  { type: 'data-nvs', offset: 0x9000, size: 0x5000 },
  { type: 'data-ota', offset: 0xe000, size: 0x2000 },
  { type: 'app-ota_0', offset: 0x10000, size: 0x640000 },
  { type: 'app-ota_1', offset: 0x650000, size: 0x640000 },
  { type: 'data-spiffs', offset: 0xc90000, size: 0x360000 },
  { type: 'data-coredump', offset: 0xff0000, size: 0x10000 },
];

export const CROSSPOINT_KO_PARTITION_TABLE = [
  { type: 'data-nvs', offset: 0x9000, size: 0x5000 },
  { type: 'data-ota', offset: 0xe000, size: 0x2000 },
  { type: 'app-ota_0', offset: 0x10000, size: 0x6a0000 },
  { type: 'app-ota_1', offset: 0x6b0000, size: 0x6a0000 },
  { type: 'data-spiffs', offset: 0xd50000, size: 0x2a0000 },
  { type: 'data-coredump', offset: 0xff0000, size: 0x10000 },
];

function matchesPartitionTable(actual, expected) {
  return actual.length === expected.length &&
    expected.every((exp, i) =>
      actual[i].type === exp.type &&
      actual[i].offset === exp.offset &&
      actual[i].size === exp.size
    );
}

// --- OTA Partition ---

// IDF otadata format: exactly two 4 KB flash sectors, each holding one
// esp_ota_select_entry_t at byte 0. This is a protocol constant, not a
// layout choice, so it's hardcoded rather than read from the PT.
const OTA_SECTOR_BYTES = 0x1000;
const OTADATA_BYTES = 2 * OTA_SECTOR_BYTES;

const OTA_STATE = { NEW: 0, PENDING_VERIFY: 1, VALID: 2, INVALID: 3, ABORTED: 4, UNDEFINED: 0xFFFFFFFF };
const INVALID_STATES = new Set([OTA_STATE.INVALID, OTA_STATE.ABORTED]);

function parseOtaPartitionSlot(data, offset) {
  const seqBytes = data.slice(offset, offset + 4);
  const sequence = leBytesToU32(seqBytes);
  const stateVal = leBytesToU32(data.slice(offset + 0x18, offset + 0x1C));
  const crcBytes = data.slice(offset + 0x1C, offset + 0x20);
  const expectedCrc = generateCrc32Le(sequence);
  return { sequence, state: stateVal, crcValid: isEqualBytes(crcBytes, expectedCrc) };
}

// IDF OTA model: active app slot = (active_seq - 1) % NUM_OTA_PARTITIONS.
// The otadata sector that holds the active entry has no fixed relation to
// the app slot it boots; the new entry goes into the OTHER sector. Pairing
// sector index with app label drifts out of sync once otadata leaves
// canonical state (interrupted OTA, a prior write that used the wrong
// mapping) and silently writes firmware into the slot the bootloader is
// about to skip.
function parseOtadata(data) {
  const slot0 = parseOtaPartitionSlot(data, 0);
  const slot1 = parseOtaPartitionSlot(data, 0x1000);

  const eligible = [];
  if (slot0.sequence !== 0xFFFFFFFF && slot0.crcValid && !INVALID_STATES.has(slot0.state)) {
    eligible.push({ sector: 0, seq: slot0.sequence });
  }
  if (slot1.sequence !== 0xFFFFFFFF && slot1.crcValid && !INVALID_STATES.has(slot1.state)) {
    eligible.push({ sector: 1, seq: slot1.sequence });
  }
  eligible.sort((a, b) => b.seq - a.seq);

  let activeSector, activeSeq, activeApp;
  if (eligible.length === 0) {
    activeSector = -1;
    activeSeq = 0;
    activeApp = 0;
  } else {
    activeSector = eligible[0].sector;
    activeSeq = eligible[0].seq;
    activeApp = (activeSeq - 1) % 2;
  }
  const inactiveApp = 1 - activeApp;
  // Smallest seq > activeSeq with (newSeq - 1) % 2 == inactiveApp. For an
  // existing active entry this is always activeSeq + 1; for the no-eligible
  // case (factory-fresh otadata, activeSeq = 0, activeApp = 0 by IDF
  // default) it has to step to 2 so the bootloader picks inactiveApp = 1.
  let newSeq = activeSeq + 1;
  while (((newSeq - 1) % 2) !== inactiveApp) newSeq++;
  const targetSector = activeSector < 0 ? 0 : (1 - activeSector);

  return {
    slot0, slot1,
    activeApp, inactiveApp,
    activeSeq, newSeq,
    targetSector,
  };
}

export function otaStateName(state) {
  switch (state) {
    case OTA_STATE.NEW: return 'new';
    case OTA_STATE.PENDING_VERIFY: return 'pending_verify';
    case OTA_STATE.VALID: return 'valid';
    case OTA_STATE.INVALID: return 'invalid';
    case OTA_STATE.ABORTED: return 'aborted';
    case OTA_STATE.UNDEFINED: return 'undefined';
    default: return `unknown (${state})`;
  }
}

// Builds the 4 KB target sector with the new entry stamped at byte 0. The
// other sector is left untouched on flash so a power cut during the erase /
// write window leaves the old (still-valid) entry as a fallback boot
// pointer, instead of blanking both sectors and forcing the bootloader's
// "no eligible otadata" default (app0).
function buildNewOtadataSector(existingSectorData, newSeq) {
  const newData = new Uint8Array(existingSectorData);
  newData.set(u32ToLeBytes(newSeq), 0);
  newData.set(u32ToLeBytes(OTA_STATE.NEW), 0x18);
  newData.set(generateCrc32Le(newSeq), 0x1C);
  return newData;
}

function assertOtadataSwitch(ota, expectedApp, expectedSeq) {
  if (ota.activeSeq !== expectedSeq || ota.activeApp !== expectedApp) {
    throw new Error(
      `OTA boot selector did not verify after write. Expected app${expectedApp} via seq ${expectedSeq}, ` +
      `got app${ota.activeApp} via seq ${ota.activeSeq} ` +
      `(slot0 seq ${ota.slot0.sequence} crc ${ota.slot0.crcValid ? 'ok' : 'bad'}, ` +
      `slot1 seq ${ota.slot1.sequence} crc ${ota.slot1.crcValid ? 'ok' : 'bad'}).`
    );
  }
}

// --- Partition Table Parsing ---

const PARTITION_TYPES = {
  0x00: { 0x10: 'app-ota_0', 0x11: 'app-ota_1' },
  0x01: { 0x00: 'data-ota', 0x01: 'data-phy', 0x02: 'data-nvs', 0x03: 'data-coredump', 0x82: 'data-spiffs' },
};

export function parsePartitionTable(data) {
  const partitions = [];
  for (let offset = 0; offset < data.length; offset += 32) {
    const chunk = data.slice(offset, offset + 32);
    if (chunk.length !== 32) break;
    let allFF = true;
    for (let i = 0; i < 32; i++) { if (chunk[i] !== 0xFF) { allFF = false; break; } }
    if (allFF) break;
    if (chunk[0] === 0xEB && chunk[1] === 0xEB) continue;

    const type = PARTITION_TYPES[chunk[2]]?.[chunk[3]] || 'unknown';
    const off = leBytesToU32(chunk.slice(4, 8));
    const size = leBytesToU32(chunk.slice(8, 12));
    partitions.push({ type, offset: off, size });
  }
  return partitions;
}

// Inverse of PARTITION_TYPES, plus the labels firmware uses with
// esp_partition_find_first(). These match the Arduino/IDF default_16MB
// scheme the device firmware is built against.
const PARTITION_ENTRY_INFO = {
  'app-ota_0': { type: 0x00, subtype: 0x10, label: 'app0' },
  'app-ota_1': { type: 0x00, subtype: 0x11, label: 'app1' },
  'data-ota': { type: 0x01, subtype: 0x00, label: 'otadata' },
  'data-nvs': { type: 0x01, subtype: 0x02, label: 'nvs' },
  'data-spiffs': { type: 0x01, subtype: 0x82, label: 'spiffs' },
  'data-coredump': { type: 0x01, subtype: 0x03, label: 'coredump' },
};

// Builds the 4 KB partition table sector for one of the reference layouts
// above: 32-byte entries (magic 0xAA50, type, subtype, offset, size, label,
// flags = 0), then the checksum row (0xEBEB + MD5 of the entries), then
// 0xFF fill. Matches gen_esp32part.py output byte for byte.
export function buildPartitionTableBinary(table) {
  const out = new Uint8Array(0x1000).fill(0xFF);
  table.forEach((p, i) => {
    const info = PARTITION_ENTRY_INFO[p.type];
    if (!info) throw new Error(`No entry info for partition type ${p.type}.`);
    const entry = out.subarray(i * 32, (i + 1) * 32);
    entry.fill(0);
    entry[0] = 0xAA;
    entry[1] = 0x50;
    entry[2] = info.type;
    entry[3] = info.subtype;
    entry.set(u32ToLeBytes(p.offset), 4);
    entry.set(u32ToLeBytes(p.size), 8);
    for (let j = 0; j < info.label.length; j++) entry[12 + j] = info.label.charCodeAt(j);
  });
  const md5Row = out.subarray(table.length * 32, (table.length + 1) * 32);
  md5Row[0] = 0xEB;
  md5Row[1] = 0xEB;
  md5Row.set(md5(out.subarray(0, table.length * 32)), 16);
  return out;
}

// Hard floor at 0x9000: 0x0..0x8000 holds the 2nd-stage bootloader and
// 0x8000..0x9000 holds the PT itself. A PT entry below that, or one that
// wraps uint32, or one past the 16 MB flash end, would let a write land in
// the bootloader region or overlap the live PT. Reject before any erase.
function extractLayout(partitions) {
  let otadata = null, app0 = null, app1 = null;
  for (const p of partitions) {
    if (p.type === 'data-ota') otadata = p;
    else if (p.type === 'app-ota_0') app0 = p;
    else if (p.type === 'app-ota_1') app1 = p;
  }
  if (!otadata) throw new Error('Partition table has no otadata partition.');
  if (!app0 || !app1) throw new Error('Partition table is missing an OTA app slot.');
  if (otadata.size < OTADATA_BYTES) {
    throw new Error(`Partition table otadata is too small: ${otadata.size} bytes (need ${OTADATA_BYTES}).`);
  }
  for (const p of [otadata, app0, app1]) {
    // end < off catches uint32 wrap on a hostile size = 0xFFFFFFFF.
    const end = (p.offset + p.size) >>> 0;
    if (p.offset < 0x9000 || end < p.offset || end > 0x1000000) {
      throw new Error(`Partition ${p.type} range 0x${p.offset.toString(16)}..0x${end.toString(16)} is outside the safe flash window.`);
    }
  }
  return {
    otadataOffset: otadata.offset,
    appSlots: [
      { offset: app0.offset, size: app0.size },
      { offset: app1.offset, size: app1.size },
    ],
  };
}

// --- Main Flasher Class ---

export class CrossPointFlasher {
  // baudrate only matters for devices behind a real USB-UART bridge; native
  // USB (USB-Serial-JTAG / CDC) ignores it. esptool-js connects at 115200
  // (the ROM baud) and switches up after the stub loads.
  // expectedChip: esptool CHIP_NAME (e.g. 'ESP32-C3', 'ESP32-S3') the selected
  // device must identify as. connect() aborts on a mismatch so firmware for one
  // board can't be written to another (e.g. Seeed's S3 build onto a C3 Xteink).
  // deviceName is only used to build a helpful error message.
  constructor(port = null, { baudrate = 115200, expectedChip = null, deviceName = null } = {}) {
    this.espLoader = null;
    this.layout = null;
    this.port = port;
    this.baudrate = baudrate;
    this.expectedChip = expectedChip;
    this.deviceName = deviceName;
  }

  // Must be called synchronously inside a user gesture (click handler) before any awaits.
  // Defaults to the Espressif USB-Serial-JTAG VID/PID the Xteink devices enumerate
  // with; pass null to list every serial port (e.g. hardware whose stock firmware
  // enumerates with a vendor-specific VID/PID, like the Sticky).
  static async requestPort(filters = [{ usbVendorId: 12346, usbProductId: 4097 }]) {
    if (!('serial' in navigator && navigator.serial)) {
      throw new Error('WebSerial is not supported. Please use Chrome or Edge.');
    }
    return await navigator.serial.requestPort(filters ? { filters } : {});
  }

  async connect() {
    const port = this.port || await CrossPointFlasher.requestPort();
    this.port = port;
    await loadEsptool();
    const transport = new Transport(port, false);
    this.espLoader = new ESPLoader({
      transport, baudrate: this.baudrate, romBaudrate: 115200, enableTracing: false,
    });
    await this.espLoader.main();

    const chipName = this.espLoader.chip?.CHIP_NAME;
    if (this.expectedChip && chipName && chipName !== this.expectedChip) {
      const label = this.deviceName ? `the ${this.deviceName}` : 'the selected device';
      // Release the port without a reset pulse; we never touched flash.
      try { await this.disconnect(true); } catch {}
      throw new Error(
        `Connected device is an ${chipName}, but ${label} uses an ${this.expectedChip}. ` +
        'Wrong device selected? Flashing was aborted before anything was written.'
      );
    }
  }

  async disconnect(skipReset = false) {
    if (!this.espLoader) return;
    // Release DTR before the reset pulse: through a USB-UART bridge DTR straps
    // GPIO0, and resetting with it asserted drops the chip into ROM download
    // mode ("waiting for download") instead of booting the app. On boards with
    // a self-holding power latch (Sticky) that state is unrecoverable from the
    // device itself — the power button drives the latch, not EN.
    try { await this.espLoader.transport.setDTR(false); } catch {}
    await this.espLoader.after(skipReset ? 'no_reset_stub' : 'hard_reset');
    // Clear both control lines before close so the port doesn't glitch EN/IO0
    // into a download-mode reset as the OS releases the device.
    try {
      await this.espLoader.transport.setDTR(false);
      await this.espLoader.transport.setRTS(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {}
    await this.espLoader.transport.disconnect();
    this.espLoader = null;
  }

  async readLayout() {
    // PT lives in one 4 KB sector at 0x8000. parsePartitionTable stops on the
    // first all-0xFF chunk, well before the sector boundary, so one sector
    // is the whole table.
    const data = await this.espLoader.readFlash(0x8000, 0x1000);
    this.layout = extractLayout(parsePartitionTable(data));
  }

  async ensureLayout() {
    if (!this.layout) await this.readLayout();
  }

  // Diagnostic-only: returns the raw PT plus which known layout it matches.
  // Does not set this.layout; flashFirmware calls readLayout() for that.
  async readPartitionTable() {
    const data = await this.espLoader.readFlash(0x8000, 0x1000);
    const partitions = parsePartitionTable(data);
    let matchedLayout = null;
    if (matchesPartitionTable(partitions, X3_PARTITION_TABLE)) matchedLayout = 'X3';
    else if (matchesPartitionTable(partitions, X4_PARTITION_TABLE)) matchedLayout = 'X4';
    else if (matchesPartitionTable(partitions, CROSSPOINT_KO_PARTITION_TABLE)) matchedLayout = 'KO';
    return { partitions, matchedLayout, raw: data };
  }

  async readOtadataPartition({ onProgress } = {}) {
    await this.ensureLayout();
    const data = await this.espLoader.readFlash(this.layout.otadataOffset, OTADATA_BYTES, (_, p, t) => {
      if (onProgress) onProgress('Read OTA data', p, t);
    });
    return { data, ota: parseOtadata(data), offset: this.layout.otadataOffset };
  }

  async readAppPartition(partition, { onProgress } = {}) {
    await this.ensureLayout();
    const appIndex = partition === 'app1' ? 1 : 0;
    const slot = this.layout.appSlots[appIndex];
    const data = await this.espLoader.readFlash(slot.offset, slot.size, (_, p, t) => {
      if (onProgress) onProgress(`Read ${partition}`, p, t);
    });
    return { data, offset: slot.offset, size: slot.size };
  }

  async readAppPartitionForIdentification(partition, { readSize = 0x6400, offset = 0, onProgress } = {}) {
    await this.ensureLayout();
    const appIndex = partition === 'app1' ? 1 : 0;
    const slot = this.layout.appSlots[appIndex];
    if (offset < 0 || readSize < 0 || offset + readSize > slot.size) {
      throw new Error(`Read range is outside ${partition}: offset ${offset}, size ${readSize}, partition size ${slot.size}.`);
    }
    return this.espLoader.readFlash(slot.offset + offset, readSize, (_, p, t) => {
      if (onProgress) onProgress(`Read ${partition}`, offset + p, offset + t);
    });
  }

  async swapBootPartition({ onStepChange, onProgress, skipReset = false } = {}) {
    const steps = ['Connect to device', 'Validate partition table', 'Read OTA data', 'Update boot partition', skipReset ? 'Disconnect' : 'Reset device'];
    const step = (idx, status) => { if (onStepChange) onStepChange(idx, steps[idx], status); };

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    await this.readLayout();
    step(1, 'done');

    step(2, 'running');
    const otaRaw = await this.espLoader.readFlash(this.layout.otadataOffset, OTADATA_BYTES, (_, p, t) => {
      if (onProgress) onProgress('Read OTA data', p, t);
    });
    const ota = parseOtadata(otaRaw);
    step(2, 'done');

    step(3, 'running');
    const sectorStart = ota.targetSector * OTA_SECTOR_BYTES;
    const existingSector = otaRaw.subarray(sectorStart, sectorStart + OTA_SECTOR_BYTES);
    const newSector = buildNewOtadataSector(existingSector, ota.newSeq);
    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(newSector), address: this.layout.otadataOffset + sectorStart }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Update boot partition', written, total); },
    });
    const verifyRaw = await this.espLoader.readFlash(this.layout.otadataOffset, OTADATA_BYTES);
    const verify = parseOtadata(verifyRaw);
    assertOtadataSwitch(verify, ota.inactiveApp, ota.newSeq);
    step(3, 'done');

    step(4, 'running');
    await this.disconnect(skipReset);
    step(4, 'done');

    return { data: verifyRaw, ota: verify, offset: this.layout.otadataOffset };
  }

  // --- OTA Flash (firmware to backup partition) ---

  async flashFirmware(firmwareData, { onStepChange, onProgress, skipReset = false } = {}) {
    const steps = [
      'Connect to device',
      'Validate partition table',
      'Read OTA data',
      'Flash firmware',
      'Update boot partition',
      skipReset ? 'Disconnect' : 'Reset device',
    ];
    const step = (idx, status) => { if (onStepChange) onStepChange(idx, steps[idx], status); };

    // Image-shape gate before connect. A bad .bin (HTML error page, partial
    // download, wrong-shape file) fails here without touching flash.
    await validateFirmwareImage(firmwareData);

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    await this.readLayout();
    step(1, 'done');

    step(2, 'running');
    const otaRaw = await this.espLoader.readFlash(this.layout.otadataOffset, OTADATA_BYTES, (_, p, t) => {
      if (onProgress) onProgress('Read OTA data', p, t);
    });
    const ota = parseOtadata(otaRaw);
    step(2, 'done');

    step(3, 'running');
    const destSlot = this.layout.appSlots[ota.inactiveApp];
    if (firmwareData.length > destSlot.size) {
      throw new Error(`Firmware too large: ${firmwareData.length} bytes won't fit in app${ota.inactiveApp} (${destSlot.size} bytes).`);
    }

    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(firmwareData), address: destSlot.offset }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Flash firmware', written, total); },
    });
    step(3, 'done');

    step(4, 'running');
    const sectorStart = ota.targetSector * OTA_SECTOR_BYTES;
    const existingSector = otaRaw.subarray(sectorStart, sectorStart + OTA_SECTOR_BYTES);
    const newSector = buildNewOtadataSector(existingSector, ota.newSeq);
    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(newSector), address: this.layout.otadataOffset + sectorStart }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Update boot partition', written, total); },
    });
    const verifyOtadata = parseOtadata(
      await this.espLoader.readFlash(this.layout.otadataOffset, OTADATA_BYTES)
    );
    assertOtadataSwitch(verifyOtadata, ota.inactiveApp, ota.newSeq);
    step(4, 'done');

    step(5, 'running');
    await this.disconnect(skipReset);
    step(5, 'done');

    return { partition: ota.inactiveApp === 0 ? 'app0' : 'app1', success: true };
  }

  // --- Full Flash Save ---

  async saveFullFlash({ onStepChange, onProgress } = {}) {
    const steps = ['Connect to device', 'Read flash (this takes ~25 min)', 'Disconnect'];
    const step = (idx, status) => { if (onStepChange) onStepChange(idx, steps[idx], status); };

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    const data = await this.espLoader.readFlash(0, 0x1000000, (_, p, t) => {
      if (onProgress) onProgress('Read flash', p, t);
    });
    step(1, 'done');

    step(2, 'running');
    await this.disconnect(true);
    step(2, 'done');

    return data;
  }

  // --- Full Flash Write ---

  async writeFullFlash(data, { onStepChange, onProgress } = {}) {
    if (data.length !== 0x1000000) {
      throw new Error(`Full flash must be exactly 16MB (0x1000000 bytes), got ${data.length}`);
    }

    const steps = ['Connect to device', 'Write flash', 'Reset device'];
    const step = (idx, status) => { if (onStepChange) onStepChange(idx, steps[idx], status); };

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(data), address: 0 }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Write flash', written, total); },
    });
    step(1, 'done');

    step(2, 'running');
    await this.disconnect();
    step(2, 'done');
  }

  // --- Boot Region Repair ---

  // Recovers a device whose partition table sector was overwritten (e.g. a
  // firmware image flashed at 0x0 with a generic esptool guide, which runs
  // through the bootloader, PT, NVS, otadata, and the head of app0). Writes
  // a known-good PT at 0x8000 and blanks NVS + otadata so the bootloader
  // starts from a clean default; optionally restores a bootloader at 0x0
  // (ESP32-C3 boots the 2nd-stage bootloader from offset 0) and writes
  // firmware into app0 (blank otadata makes the bootloader pick app0, so no
  // boot-selector write is needed). Without firmwareData, firmware still
  // needs to be flashed afterwards via the normal flash flow.
  // otadataData: optional initialized otadata image (e.g. Arduino's
  // boot_app0.bin, which selects ota_0 explicitly). Defaults to blank 0xFF,
  // which relies on the bootloader's no-otadata fallback instead.
  // bootloaderOffset: where the chip's ROM expects the 2nd-stage bootloader —
  // 0x0 on ESP32-C3/S3, 0x1000 on the classic ESP32 (M5Paper). Writing at the
  // wrong offset leaves the board unbootable until reflashed.
  async repairBootRegion(table, {
    bootloaderData = null,
    bootloaderOffset = 0x0,
    partitionTableData = null,
    firmwareData = null,
    otadataData = null,
    preserveNvs = false,
    flashSize = 'keep',
    flashMode = 'keep',
    flashFreq = 'keep',
    onStepChange,
    onProgress,
    skipReset = false,
  } = {}) {
    const nvs = table.find((p) => p.type === 'data-nvs');
    const otadata = table.find((p) => p.type === 'data-ota');
    const app0 = table.find((p) => p.type === 'app-ota_0');
    if (!nvs || !otadata || !app0) throw new Error('Reference layout is missing NVS, otadata, or app0.');
    if (firmwareData) {
      await validateFirmwareImage(firmwareData);
      if (firmwareData.length > app0.size) {
        throw new Error(`Firmware too large: ${firmwareData.length} bytes won't fit in app0 (${app0.size} bytes).`);
      }
    }
    if (bootloaderData) {
      if (bootloaderData[0] !== ESP_IMAGE_MAGIC) {
        throw new Error('Invalid bootloader: ESP image magic byte (0xE9) missing. Are you sure this is a bootloader .bin?');
      }
      if (bootloaderOffset + bootloaderData.length > 0x8000) {
        throw new Error(`Bootloader too large: ${bootloaderData.length} bytes at 0x${bootloaderOffset.toString(16)} won't fit below the partition table at 0x8000.`);
      }
    }
    if (otadataData && otadataData.length > otadata.size) {
      throw new Error(`otadata image too large: ${otadataData.length} bytes won't fit in otadata (${otadata.size} bytes).`);
    }
    if (partitionTableData) {
      if (partitionTableData.length > 0x1000) {
        throw new Error(`Partition table image is too large: ${partitionTableData.length} bytes (maximum 4096).`);
      }
      if (!matchesPartitionTable(parsePartitionTable(partitionTableData), table)) {
        throw new Error('Packaged partition table does not match the expected device layout.');
      }
    }

    const writeLabel = 'Write ' + [
      bootloaderData && 'bootloader',
      'partition table',
      firmwareData && 'firmware',
    ].filter(Boolean).join(' + ');
    const steps = [
      'Connect to device',
      writeLabel,
      'Verify partition table',
      skipReset ? 'Disconnect' : 'Reset device',
    ];
    const step = (idx, status) => { if (onStepChange) onStepChange(idx, steps[idx], status); };

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    const fileArray = [];
    if (bootloaderData) {
      fileArray.push({ data: this.espLoader.ui8ToBstr(bootloaderData), address: bootloaderOffset });
    }
    const partitionBinary = partitionTableData || buildPartitionTableBinary(table);
    fileArray.push({ data: this.espLoader.ui8ToBstr(partitionBinary), address: 0x8000 });
    // Repair flows normally blank NVS and otadata because erased flash is the
    // state firmware knows how to initialize from. A packaged install can
    // preserve NVS to reproduce an upstream four-part image exactly. An
    // explicit otadataData image (boot_app0.bin) overrides blank otadata.
    if (!preserveNvs) {
      fileArray.push({ data: this.espLoader.ui8ToBstr(new Uint8Array(nvs.size).fill(0xFF)), address: nvs.offset });
    }
    if (otadataData) {
      fileArray.push({ data: this.espLoader.ui8ToBstr(otadataData), address: otadata.offset });
    } else {
      fileArray.push({ data: this.espLoader.ui8ToBstr(new Uint8Array(otadata.size).fill(0xFF)), address: otadata.offset });
    }
    if (firmwareData) {
      fileArray.push({ data: this.espLoader.ui8ToBstr(firmwareData), address: app0.offset });
    }
    await this.espLoader.writeFlash({
      fileArray,
      flashSize, flashMode, flashFreq,
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Write boot region', written, total); },
    });
    step(1, 'done');

    step(2, 'running');
    const readBack = parsePartitionTable(await this.espLoader.readFlash(0x8000, 0x1000));
    if (!matchesPartitionTable(readBack, table)) {
      throw new Error('Partition table did not verify after write. Read it back on the debug page and retry.');
    }
    this.layout = extractLayout(readBack);
    step(2, 'done');

    step(3, 'running');
    await this.disconnect(skipReset);
    step(3, 'done');

    return { partitions: readBack };
  }
}

// --- Firmware Download Helpers ---

// Bundled ESP32-C3 2nd-stage bootloader (from the CrossPoint PlatformIO
// build), served as a static asset. Used by the boot-region repair flow to
// restore offset 0x0 after an accidental overwrite.
export async function fetchBundledBootloader() {
  const res = await fetch('/firmware/bootloader.bin');
  if (!res.ok) throw new Error(`Failed to download bundled bootloader: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Static boot-region asset (per-device bootloader, boot_app0 otadata image)
// served from /public/firmware. Used by the full-install flow for non-Xteink
// devices: their stock bootloaders won't boot a CrossPoint app from its OTA
// slot, so first-time installs must replace the whole boot region.
export async function fetchFlashAsset(path, label) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchEarlyAccessFirmware() {
  const res = await fetch('/api/build/firmware');
  if (!res.ok) throw new Error(`Failed to download firmware: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchReleaseFirmware(model = 'x4') {
  const res = await fetch('/api/release/firmware');
  if (!res.ok) throw new Error(`Failed to download release firmware: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchStockFirmware(model, lang) {
  const res = await fetch(`/api/firmware/stock?model=${model}&lang=${lang}`);
  if (!res.ok) throw new Error(`Failed to download stock firmware: ${res.status}`);
  return { data: new Uint8Array(await res.arrayBuffer()), version: res.headers.get('X-Firmware-Version') || '' };
}

export async function fetchStockFirmwareInfo(model, lang) {
  const res = await fetch(`/api/firmware/stock/info?model=${model}&lang=${lang}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchBuildMeta() {
  const res = await fetch('/api/build/latest');
  if (!res.ok) return null;
  return res.json();
}

// --- Custom Font Build Helpers ---

export async function fetchFontList() {
  const res = await fetch('/api/fonts');
  if (!res.ok) return null;
  return res.json();
}

export async function fetchCustomBuildStatus() {
  const res = await fetch('/api/custom-build/status');
  if (!res.ok) return null;
  const data = await res.json();
  return data.build;
}

export async function uploadCustomFonts(replacements, labels = {}, sizes = {}) {
  const formData = new FormData();
  for (const [path, file] of Object.entries(replacements)) {
    formData.append(path, file);
  }
  for (const [family, label] of Object.entries(labels)) {
    formData.append(`label:${family}`, label);
  }
  for (const [family, sizeArr] of Object.entries(sizes)) {
    formData.append(`sizes:${family}`, sizeArr.join(','));
  }
  const res = await fetch('/api/custom-build/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCustomFirmware() {
  const res = await fetch('/api/custom-build/firmware');
  if (!res.ok) throw new Error(`Failed to download custom firmware: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchBetaBuilds() {
  const res = await fetch('/api/beta');
  if (!res.ok) return [];
  const data = await res.json();
  return data.builds || [];
}

export async function fetchBetaFirmware(id) {
  const res = await fetch(`/api/beta/${id}/firmware`);
  if (!res.ok) throw new Error(`Failed to download beta firmware: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchReleaseMeta() {
  const res = await fetch('/api/release/latest');
  if (!res.ok) return null;
  return res.json();
}

// Admin-uploaded single builds for non-Xteink devices (m5paper, lilygo).
export async function fetchDeviceBuildInfo(device) {
  const res = await fetch(`/api/device-build/${device}/info`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.build || null;
}

export async function fetchDeviceBuildFirmware(device) {
  const res = await fetch(`/api/device-build/${device}/firmware`);
  if (!res.ok) throw new Error(`Failed to download firmware: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// --- File download helper ---

export function downloadBlob(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
