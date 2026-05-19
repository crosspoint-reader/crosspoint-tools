/**
 * CrossPoint ESP32 Flasher — shared flashing module
 * Uses esptool-js via ESM import for WebSerial-based OTA flashing.
 */

let ESPLoader, Transport;

export async function loadEsptool() {
  if (ESPLoader) return;
  const mod = await import('/js/esptool.bundle.js');
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

function parsePartitionTable(data) {
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
  constructor(port = null) {
    this.espLoader = null;
    this.layout = null;
    this.port = port;
  }

  // Must be called synchronously inside a user gesture (click handler) before any awaits.
  static async requestPort() {
    if (!('serial' in navigator && navigator.serial)) {
      throw new Error('WebSerial is not supported. Please use Chrome or Edge.');
    }
    return await navigator.serial.requestPort({
      filters: [{ usbVendorId: 12346, usbProductId: 4097 }],
    });
  }

  async connect() {
    const port = this.port || await CrossPointFlasher.requestPort();
    this.port = port;
    await loadEsptool();
    const transport = new Transport(port, false);
    this.espLoader = new ESPLoader({
      transport, baudrate: 115200, romBaudrate: 115200, enableTracing: false,
    });
    await this.espLoader.main();
  }

  async disconnect(skipReset = false) {
    if (!this.espLoader) return;
    await this.espLoader.after(skipReset ? 'no_reset_stub' : 'hard_reset');
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
}

// --- Firmware Download Helpers ---

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
