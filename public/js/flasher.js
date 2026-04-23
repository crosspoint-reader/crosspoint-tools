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

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc >>> 0;
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
  return u32ToLeBytes(crc32(u32ToLeBytes(sequence)));
}

// --- Partition Layouts ---

export const X4_LAYOUT = {
  app0Offset: 0x10000,
  app1Offset: 0x650000,
  appSize: 0x640000,
};

export const X3_LAYOUT = {
  app0Offset: 0x10000,
  app1Offset: 0x780000,
  appSize: 0x770000,
};

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

export function getLayout(model) {
  return model === 'x3' ? X3_LAYOUT : X4_LAYOUT;
}

function getExpectedPartitionTables(model) {
  // X3 can have either X3 or X4 partition layout
  return model === 'x3'
    ? [X3_PARTITION_TABLE, X4_PARTITION_TABLE]
    : [X4_PARTITION_TABLE];
}

// --- OTA Partition ---

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

function parseOtadata(data) {
  const slot0 = parseOtaPartitionSlot(data, 0);
  const slot1 = parseOtaPartitionSlot(data, 0x1000);
  const candidates = [];
  if (!INVALID_STATES.has(slot0.state) && slot0.crcValid) candidates.push({ label: 'app0', ...slot0 });
  if (!INVALID_STATES.has(slot1.state) && slot1.crcValid) candidates.push({ label: 'app1', ...slot1 });
  candidates.sort((a, b) => b.sequence - a.sequence);

  const currentBoot = candidates[0]?.label || 'app0';
  const backupPartition = currentBoot === 'app0' ? 'app1' : 'app0';
  const nextSequence = (candidates[0]?.sequence || 0) + 1;
  return { slot0, slot1, currentBoot, backupPartition, nextSequence };
}

function buildNewOtadata(existingData, backupPartition, nextSequence) {
  const newData = new Uint8Array(existingData);
  const offset = backupPartition === 'app1' ? 0x1000 : 0;
  newData.set(u32ToLeBytes(nextSequence), offset);
  newData.set(u32ToLeBytes(OTA_STATE.NEW), offset + 0x18);
  newData.set(generateCrc32Le(nextSequence), offset + 0x1C);
  return newData;
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

function matchesPartitionTable(actual, expected) {
  return actual.length === expected.length &&
    expected.every((exp, i) =>
      actual[i].type === exp.type &&
      actual[i].offset === exp.offset &&
      actual[i].size === exp.size
    );
}

// --- Main Flasher Class ---

export class CrossPointFlasher {
  constructor(model = 'x4') {
    this.espLoader = null;
    this.model = model;
    this.layout = getLayout(model);
  }

  async connect() {
    await loadEsptool();
    if (!('serial' in navigator && navigator.serial)) {
      throw new Error('WebSerial is not supported. Please use Chrome or Edge.');
    }
    const port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 12346, usbProductId: 4097 }],
    });
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

  async validatePartitionTable() {
    const data = await this.espLoader.readFlash(0x8000, 0x2000);
    const partitions = parsePartitionTable(data);
    const expected = getExpectedPartitionTables(this.model);
    const matched = expected.find(t => matchesPartitionTable(partitions, t));

    if (!matched) {
      throw new Error(`Unexpected partition layout for ${this.model.toUpperCase()}. Make sure you selected the correct device model.`);
    }

    // If X3 device has X4 partition layout, use X4 layout
    if (matchesPartitionTable(partitions, X3_PARTITION_TABLE)) {
      this.layout = X3_LAYOUT;
    } else {
      this.layout = X4_LAYOUT;
    }
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

    step(0, 'running');
    await this.connect();
    step(0, 'done');

    step(1, 'running');
    await this.validatePartitionTable();
    step(1, 'done');

    step(2, 'running');
    const otaRaw = await this.espLoader.readFlash(0xE000, 0x2000, (_, p, t) => {
      if (onProgress) onProgress('Read OTA data', p, t);
    });
    const ota = parseOtadata(otaRaw);
    step(2, 'done');

    step(3, 'running');
    const targetOffset = ota.backupPartition === 'app0' ? this.layout.app0Offset : this.layout.app1Offset;
    if (firmwareData.length > this.layout.appSize) throw new Error(`Firmware too large: ${firmwareData.length} bytes (max ${this.layout.appSize})`);
    if (firmwareData.length < 0xF0000) throw new Error('Firmware seems too small. Are you sure this is the right file?');

    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(firmwareData), address: targetOffset }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Flash firmware', written, total); },
    });
    step(3, 'done');

    step(4, 'running');
    const newOtadata = buildNewOtadata(otaRaw, ota.backupPartition, ota.nextSequence);
    await this.espLoader.writeFlash({
      fileArray: [{ data: this.espLoader.ui8ToBstr(newOtadata), address: 0xE000 }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_, written, total) => { if (onProgress) onProgress('Update boot partition', written, total); },
    });
    step(4, 'done');

    step(5, 'running');
    await this.disconnect(skipReset);
    step(5, 'done');

    return { partition: ota.backupPartition, success: true };
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
  // X3 uses the nightly build
  if (model === 'x3') {
    const res = await fetch('/api/build/firmware');
    if (!res.ok) throw new Error(`Failed to download X3 firmware: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
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
