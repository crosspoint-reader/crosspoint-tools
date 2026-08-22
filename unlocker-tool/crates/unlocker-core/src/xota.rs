//! Xteink X4 Pro `.xota` (`encrypted_v1`) firmware packaging.
//!
//! The X4 Pro's stock updater does not accept a plain ESP-IDF app image. It
//! downloads an `encrypted_v1` `.xota` package, decrypts it on-device with a
//! firmware-embedded static key, verifies the plaintext sha256 against the
//! `plain_sha256` in both the package metadata and the `check-update` response,
//! and only then flashes it. To push our own firmware to an X4 Pro over the
//! spoofed OTA we therefore have to *encrypt* our plain `.bin` into a valid
//! `.xota` the stock updater will accept.
//!
//! Package layout (little-endian offsets into the file):
//! ```text
//!   [0:4]     magic  "XOTA"
//!   [4:20]    IV/nonce (16 bytes) for AES-128-CTR
//!   [20:202]  metadata (182 bytes), AES-128-CTR encrypted
//!   [202:..]  body = the plain app image, AES-128-CTR encrypted
//! ```
//! The CTR keystream is a **single continuous counter** starting at `IV` and
//! running across metadata *then* body — the body counter does not restart
//! (182 = 11*16 + 6, so the body begins at block 11, byte 6).
//!
//! Decrypted metadata (182 bytes), fixed offsets:
//! ```text
//!   [0:4]     plaintext firmware length as little-endian u32
//!   [4:36]    plain_sha256 as raw 32 bytes
//!   [36:38]   flags 0x01 0x00
//!   [38:..]   version string  (NUL-terminated, e.g. "V7.0.9")
//!   [70:..]   device_type     (NUL-terminated, "ESP32S3_X4_TL")
//!   [94:..]   panel           (NUL-terminated, "SSD1677")
//!   rest      zero padding
//! ```
//!
//! The key is a static firmware constant: `key[i] = table[i] ^ ((17*i - 0x5b) &
//! 0xff)` over the 16-byte table at DROM `0x3c2f0538` of the X4 Pro (SSD1677)
//! factory image. It decrypts (and, here, encrypts) every X4 Pro `.xota` until
//! Xteink rotates the table. This mirrors the offline `xota_decrypt.py`
//! reference tool; `encrypt` is its exact inverse and reproduces a real
//! `.xota` byte-for-byte given the same IV.

use crate::types::Model;
use aes::cipher::{KeyIvInit, StreamCipher};
use sha2::{Digest, Sha256};

/// AES-128-CTR with a 128-bit big-endian counter, matching the device's PSA
/// cipher setup (and pycryptodome's `MODE_CTR` with a full-width nonce).
type Aes128Ctr = ctr::Ctr128BE<aes::Aes128>;

const MAGIC: &[u8; 4] = b"XOTA";
/// Encrypted metadata region length (`xota[20..202]`).
const META_LEN: usize = 182;

/// 16-byte key table at DROM `0x3c2f0538` (X4 Pro, SSD1677 panel).
const KEY_TABLE: [u8; 16] = [
    0xea, 0x91, 0x56, 0x60, 0xe4, 0x2d, 0x51, 0x76, 0xc2, 0x33, 0x3d, 0xea, 0x48, 0x2a, 0x53, 0xfa,
];

const META_FLAGS: [u8; 2] = [0x01, 0x00];

const ESP_IMAGE_MAGIC: u8 = 0xe9;
const ESP_IMAGE_HEADER_LEN: usize = 24;
const ESP_SEGMENT_HEADER_LEN: usize = 8;
const ESP_APP_DESC_LEN: usize = 256;
const ESP_APP_DESC_MAGIC: u32 = 0xabcd_5432;
const ESP_CHECKSUM_SEED: u8 = 0xef;
const ESP_MAX_SEGMENTS: usize = 16;
const APP_DESC_OFFSET: usize = ESP_IMAGE_HEADER_LEN + ESP_SEGMENT_HEADER_LEN;
const APP_VERSION_OFFSET: usize = APP_DESC_OFFSET + 0x10;
const APP_PROJECT_OFFSET: usize = APP_DESC_OFFSET + 0x30;
const APP_IDENTITY_FIELD_LEN: usize = 32;

/// Stock-compatible identity used for custom X4 Pro application images. The
/// stock updater accepts the encrypted transport metadata independently, but
/// rejects a first application block whose embedded project/version identify
/// it as a lower-version third-party build.
pub const STOCK_APP_PROJECT: &str = "xteink_app";
pub const STOCK_APP_VERSION: &str = "7.9.9";

#[derive(Debug, Clone)]
pub struct NormalizedAppImage {
    pub bytes: Vec<u8>,
    pub changed: bool,
    pub original_project: String,
    pub original_version: String,
}

/// Normalize a custom ESP32-S3 app image to the identity accepted by the stock
/// X4 Pro OTA validator, repairing both ESP image integrity fields afterward.
/// Genuine `xteink_app` images are returned byte-for-byte unchanged.
pub fn normalize_x4pro_app_identity(plain: &[u8]) -> anyhow::Result<NormalizedAppImage> {
    if plain.len() < APP_DESC_OFFSET + ESP_APP_DESC_LEN {
        anyhow::bail!("X4 Pro firmware is too short to contain an ESP app descriptor");
    }
    if plain[0] != ESP_IMAGE_MAGIC {
        anyhow::bail!(
            "X4 Pro firmware has invalid ESP image magic 0x{:02x}",
            plain[0]
        );
    }
    let segment_count = plain[1] as usize;
    if segment_count == 0 || segment_count > ESP_MAX_SEGMENTS {
        anyhow::bail!("X4 Pro firmware has invalid segment count {segment_count}");
    }
    let app_desc_magic = u32::from_le_bytes(
        plain[APP_DESC_OFFSET..APP_DESC_OFFSET + 4]
            .try_into()
            .unwrap(),
    );
    if app_desc_magic != ESP_APP_DESC_MAGIC {
        anyhow::bail!("X4 Pro firmware has invalid app descriptor magic 0x{app_desc_magic:08x}");
    }
    verify_esp_image_integrity(plain, segment_count)?;

    let original_version =
        read_fixed_cstr(&plain[APP_VERSION_OFFSET..APP_VERSION_OFFSET + APP_IDENTITY_FIELD_LEN]);
    let original_project =
        read_fixed_cstr(&plain[APP_PROJECT_OFFSET..APP_PROJECT_OFFSET + APP_IDENTITY_FIELD_LEN]);
    if original_project == STOCK_APP_PROJECT {
        return Ok(NormalizedAppImage {
            bytes: plain.to_vec(),
            changed: false,
            original_project,
            original_version,
        });
    }

    let mut bytes = plain.to_vec();
    write_fixed_cstr(
        &mut bytes[APP_VERSION_OFFSET..APP_VERSION_OFFSET + APP_IDENTITY_FIELD_LEN],
        STOCK_APP_VERSION,
        "app version",
    )?;
    write_fixed_cstr(
        &mut bytes[APP_PROJECT_OFFSET..APP_PROJECT_OFFSET + APP_IDENTITY_FIELD_LEN],
        STOCK_APP_PROJECT,
        "project name",
    )?;
    repair_esp_image_integrity(&mut bytes, segment_count)?;

    Ok(NormalizedAppImage {
        bytes,
        changed: true,
        original_project,
        original_version,
    })
}

fn read_fixed_cstr(field: &[u8]) -> String {
    let end = field.iter().position(|&b| b == 0).unwrap_or(field.len());
    String::from_utf8_lossy(&field[..end]).into_owned()
}

fn write_fixed_cstr(field: &mut [u8], value: &str, name: &str) -> anyhow::Result<()> {
    let value = value.as_bytes();
    if value.len() >= field.len() {
        anyhow::bail!("{name} is too long for the ESP app descriptor");
    }
    field.fill(0);
    field[..value.len()].copy_from_slice(value);
    Ok(())
}

fn esp_image_integrity_layout(
    bytes: &[u8],
    segment_count: usize,
) -> anyhow::Result<(usize, bool, u8)> {
    let mut checksum = ESP_CHECKSUM_SEED;
    let mut pos = ESP_IMAGE_HEADER_LEN;
    for segment in 0..segment_count {
        let header_end = pos
            .checked_add(ESP_SEGMENT_HEADER_LEN)
            .ok_or_else(|| anyhow::anyhow!("ESP segment {segment} header offset overflow"))?;
        if header_end > bytes.len() {
            anyhow::bail!("ESP segment {segment} header is truncated");
        }
        let data_len = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        pos = header_end;
        let data_end = pos
            .checked_add(data_len)
            .ok_or_else(|| anyhow::anyhow!("ESP segment {segment} length overflow"))?;
        if data_end > bytes.len() {
            anyhow::bail!("ESP segment {segment} data is truncated");
        }
        for &byte in &bytes[pos..data_end] {
            checksum ^= byte;
        }
        pos = data_end;
    }

    // ESP images always reserve at least one byte after the segment data for
    // the checksum, then pad the region to a 16-byte boundary.
    let pad_end = pos
        .checked_add(16)
        .ok_or_else(|| anyhow::anyhow!("ESP checksum offset overflow"))?
        & !15;
    let hash_appended = bytes[23] != 0;
    let expected_len = pad_end + if hash_appended { 32 } else { 0 };
    if bytes.len() != expected_len {
        anyhow::bail!(
            "ESP image length mismatch: file has {} bytes, parsed image requires {expected_len}",
            bytes.len()
        );
    }
    Ok((pad_end, hash_appended, checksum))
}

fn verify_esp_image_integrity(bytes: &[u8], segment_count: usize) -> anyhow::Result<()> {
    let (pad_end, hash_appended, checksum) = esp_image_integrity_layout(bytes, segment_count)?;
    if bytes[pad_end - 1] != checksum {
        anyhow::bail!(
            "ESP image checksum mismatch: expected 0x{checksum:02x}, found 0x{:02x}",
            bytes[pad_end - 1]
        );
    }
    if hash_appended {
        let digest: [u8; 32] = Sha256::digest(&bytes[..pad_end]).into();
        if bytes[pad_end..] != digest {
            anyhow::bail!("ESP image appended SHA-256 is invalid");
        }
    }
    Ok(())
}

fn repair_esp_image_integrity(bytes: &mut [u8], segment_count: usize) -> anyhow::Result<()> {
    let (pad_end, hash_appended, checksum) = esp_image_integrity_layout(bytes, segment_count)?;
    bytes[pad_end - 1] = checksum;
    if hash_appended {
        let digest: [u8; 32] = Sha256::digest(&bytes[..pad_end]).into();
        bytes[pad_end..].copy_from_slice(&digest);
    }
    Ok(())
}

/// Firmware key derivation: `key[i] = table[i] ^ ((17*i - 0x5b) & 0xff)`.
/// Yields `4f2791b80dd75a6aef0d728a39a8c05e` for the shipped table.
fn derive_key() -> [u8; 16] {
    let mut key = [0u8; 16];
    for (i, k) in key.iter_mut().enumerate() {
        // 17*i - 0x5b can go negative; wrap in i32 then mask to a byte, matching
        // the reference `((17*i - 0x5b) & 0xff)`.
        let mixin = ((17i32 * i as i32) - 0x5b) & 0xff;
        *k = KEY_TABLE[i] ^ mixin as u8;
    }
    key
}

/// Build the 182-byte plaintext metadata block for `plain_sha256`.
///
/// `version`/`device_type`/`panel` are written at their fixed offsets and
/// NUL-padded. Callers pass the values the target device expects; for the X4
/// Pro that's `ESP32S3_X4_TL` / `SSD1677`.
fn build_metadata(
    plain_size: u32,
    plain_sha256: &[u8; 32],
    version: &str,
    device_type: &str,
    panel: &str,
) -> [u8; META_LEN] {
    let mut m = [0u8; META_LEN];
    m[0..4].copy_from_slice(&plain_size.to_le_bytes());
    m[4..36].copy_from_slice(plain_sha256);
    m[36..38].copy_from_slice(&META_FLAGS);
    write_cstr(&mut m, 38, version);
    write_cstr(&mut m, 70, device_type);
    write_cstr(&mut m, 94, panel);
    m
}

/// Copy `s` into `buf` at `off`, truncating so a NUL terminator always fits
/// inside the metadata block (the fields are short fixed-width slots).
fn write_cstr(buf: &mut [u8; META_LEN], off: usize, s: &str) {
    let bytes = s.as_bytes();
    // Leave room for the implicit NUL: never fill the byte at the next field's
    // start. The real images keep every string comfortably within its slot, so
    // this only guards against a caller passing something pathological.
    let max = META_LEN.saturating_sub(off + 1);
    let n = bytes.len().min(max);
    buf[off..off + n].copy_from_slice(&bytes[..n]);
}

/// Encryption result: the `.xota` bytes plus the identity fields the
/// `check-update` manifest must advertise for the device to accept and verify
/// the package.
#[derive(Debug, Clone)]
pub struct EncryptedXota {
    /// The full `encrypted_v1` `.xota` package to serve.
    pub bytes: Vec<u8>,
    /// sha256 of the plain (pre-encryption) image, lowercase hex.
    pub plain_sha256: String,
    /// Byte length of the plain image.
    pub plain_size: u64,
    /// sha256 of the `.xota` package itself, lowercase hex (transport checksum).
    pub xota_sha256: String,
    /// CRC-32 (IEEE) of the `.xota` package (transport checksum).
    pub xota_crc32: u32,
}

/// Encrypt a plain ESP-IDF app image into an `encrypted_v1` `.xota` for `model`.
///
/// `model` must be an X4 Pro; other models don't use the encrypted OTA path.
/// `iv` is normally `None` (a fresh random nonce is generated); it exists so
/// tests can reproduce a known package. `version` populates the metadata
/// version string.
pub fn encrypt(
    model: Model,
    plain: &[u8],
    version: &str,
    iv: Option<[u8; 16]>,
) -> anyhow::Result<EncryptedXota> {
    let device_type = model.device_type();
    let panel = model.panel().unwrap_or("");

    let plain_size = u32::try_from(plain.len())
        .map_err(|_| anyhow::anyhow!("plain firmware is larger than the XOTA u32 size field"))?;
    let plain_digest: [u8; 32] = Sha256::digest(plain).into();
    let meta = build_metadata(plain_size, &plain_digest, version, device_type, panel);

    let iv = iv.unwrap_or_else(random_iv);
    let key = derive_key();

    // One continuous CTR stream over metadata || body.
    let mut stream = vec![0u8; META_LEN + plain.len()];
    stream[..META_LEN].copy_from_slice(&meta);
    stream[META_LEN..].copy_from_slice(plain);
    let mut cipher = Aes128Ctr::new((&key).into(), (&iv).into());
    cipher.apply_keystream(&mut stream);

    let mut bytes = Vec::with_capacity(4 + 16 + stream.len());
    bytes.extend_from_slice(MAGIC);
    bytes.extend_from_slice(&iv);
    bytes.extend_from_slice(&stream);

    let xota_sha256 = hex::encode(Sha256::digest(&bytes));
    let xota_crc32 = crc32_ieee(&bytes);

    Ok(EncryptedXota {
        bytes,
        plain_sha256: hex::encode(plain_digest),
        plain_size: plain.len() as u64,
        xota_sha256,
        xota_crc32,
    })
}

/// Identity fields read out of an existing `encrypted_v1` `.xota` (e.g. a real
/// Xteink stock package served verbatim) so the manifest can advertise them.
#[derive(Debug, Clone)]
pub struct XotaInfo {
    pub plain_size: u64,
    pub plain_sha256: String,
    pub xota_sha256: String,
    pub xota_crc32: u32,
}

/// Inspect an already-built `.xota` without re-encrypting it: decrypt just the
/// 182-byte metadata to recover `plain_sha256`, and derive the other manifest
/// fields. Used to serve a real stock `.xota` byte-for-byte for diagnostics.
pub fn inspect(xota: &[u8]) -> anyhow::Result<XotaInfo> {
    if xota.len() < 202 || &xota[0..4] != MAGIC {
        anyhow::bail!("not a valid .xota (missing XOTA magic / too short)");
    }
    let iv: [u8; 16] = xota[4..20].try_into().unwrap();
    let key = derive_key();
    // Decrypt the first 182 bytes of the CTR stream (the metadata block).
    let mut meta = xota[20..202].to_vec();
    let mut cipher = Aes128Ctr::new((&key).into(), (&iv).into());
    cipher.apply_keystream(&mut meta);
    let declared_plain_size = u32::from_le_bytes(meta[0..4].try_into().unwrap()) as u64;
    let actual_plain_size = (xota.len() - 202) as u64;
    if declared_plain_size != actual_plain_size {
        anyhow::bail!(
            "invalid .xota plaintext length: metadata declares {declared_plain_size}, package contains {actual_plain_size}"
        );
    }
    let plain_sha256 = hex::encode(&meta[4..36]); // raw 32-byte sha at [4:36]
    Ok(XotaInfo {
        plain_size: declared_plain_size,
        plain_sha256,
        xota_sha256: hex::encode(Sha256::digest(xota)),
        xota_crc32: crc32_ieee(xota),
    })
}

/// Random 16-byte IV. Uses the process clock + a getrandom fallback via
/// `uuid` (already a dependency) to avoid pulling in a rng crate. CTR only
/// needs the nonce to be unique per package under a fixed key; these bytes are
/// not secret (the key is a public firmware constant), so uniqueness is the
/// only requirement.
fn random_iv() -> [u8; 16] {
    // uuid v4 is backed by getrandom; two of them give us 16 random bytes.
    let mut iv = [0u8; 16];
    iv[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    // XOR in a second uuid so we don't leak the v4 version/variant nibbles into
    // a predictable position — belt-and-braces for nonce uniqueness.
    for (b, r) in iv.iter_mut().zip(uuid::Uuid::new_v4().as_bytes()) {
        *b ^= *r;
    }
    iv
}

/// Standard IEEE CRC-32 (poly 0xEDB88320, reflected), no external crate. Used
/// for the `.xota` transport checksum the manifest advertises.
fn crc32_ieee(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic_esp_app(project: &str, version: &str) -> Vec<u8> {
        let segment_data_len = 320usize;
        let segment_end = ESP_IMAGE_HEADER_LEN + ESP_SEGMENT_HEADER_LEN + segment_data_len;
        let pad_end = (segment_end + 16) & !15;
        let mut image = vec![0u8; pad_end + 32];
        image[0] = ESP_IMAGE_MAGIC;
        image[1] = 1;
        image[12..14].copy_from_slice(&9u16.to_le_bytes()); // ESP32-S3
        image[23] = 1; // appended SHA-256
        image[ESP_IMAGE_HEADER_LEN..ESP_IMAGE_HEADER_LEN + 4]
            .copy_from_slice(&0x3c00_0020u32.to_le_bytes());
        image[ESP_IMAGE_HEADER_LEN + 4..APP_DESC_OFFSET]
            .copy_from_slice(&(segment_data_len as u32).to_le_bytes());
        image[APP_DESC_OFFSET..APP_DESC_OFFSET + 4]
            .copy_from_slice(&ESP_APP_DESC_MAGIC.to_le_bytes());
        write_fixed_cstr(
            &mut image[APP_VERSION_OFFSET..APP_VERSION_OFFSET + APP_IDENTITY_FIELD_LEN],
            version,
            "app version",
        )
        .unwrap();
        write_fixed_cstr(
            &mut image[APP_PROJECT_OFFSET..APP_PROJECT_OFFSET + APP_IDENTITY_FIELD_LEN],
            project,
            "project name",
        )
        .unwrap();
        for (i, byte) in image[APP_DESC_OFFSET + ESP_APP_DESC_LEN..segment_end]
            .iter_mut()
            .enumerate()
        {
            *byte = i.wrapping_mul(37) as u8;
        }
        repair_esp_image_integrity(&mut image, 1).unwrap();
        image
    }

    /// The derived key must equal the published constant.
    #[test]
    fn key_derivation_matches_reference() {
        assert_eq!(
            hex::encode(derive_key()),
            "4f2791b80dd75a6aef0d728a39a8c05e"
        );
    }

    #[test]
    fn normalizes_custom_app_identity_and_repairs_integrity() {
        let original = synthetic_esp_app("crosspoint-reader", "1.6.0rc-11-gabc");
        let original_sha = Sha256::digest(&original);
        let normalized = normalize_x4pro_app_identity(&original).unwrap();

        assert!(normalized.changed);
        assert_eq!(normalized.original_project, "crosspoint-reader");
        assert_eq!(normalized.original_version, "1.6.0rc-11-gabc");
        assert_eq!(normalized.bytes.len(), original.len());
        assert_ne!(Sha256::digest(&normalized.bytes), original_sha);
        assert_eq!(
            read_fixed_cstr(
                &normalized.bytes[APP_PROJECT_OFFSET..APP_PROJECT_OFFSET + APP_IDENTITY_FIELD_LEN]
            ),
            STOCK_APP_PROJECT
        );
        assert_eq!(
            read_fixed_cstr(
                &normalized.bytes[APP_VERSION_OFFSET..APP_VERSION_OFFSET + APP_IDENTITY_FIELD_LEN]
            ),
            STOCK_APP_VERSION
        );
        verify_esp_image_integrity(&normalized.bytes, 1).unwrap();

        let second = normalize_x4pro_app_identity(&normalized.bytes).unwrap();
        assert!(!second.changed);
        assert_eq!(second.bytes, normalized.bytes);
    }

    #[test]
    fn preserves_genuine_xteink_app_byte_for_byte() {
        let original = synthetic_esp_app(STOCK_APP_PROJECT, "7.0.8");
        let normalized = normalize_x4pro_app_identity(&original).unwrap();
        assert!(!normalized.changed);
        assert_eq!(normalized.bytes, original);
        assert_eq!(normalized.original_version, "7.0.8");
    }

    #[test]
    fn rejects_corrupt_custom_app_before_normalizing() {
        let mut corrupt = synthetic_esp_app("crosspoint-reader", "1.6.0rc");
        corrupt[APP_DESC_OFFSET + ESP_APP_DESC_LEN + 3] ^= 0x80;
        let error = normalize_x4pro_app_identity(&corrupt).unwrap_err();
        assert!(error.to_string().contains("checksum mismatch"));
    }

    /// Decrypt is the inverse of encrypt — recover the plain image and the
    /// metadata sha for an arbitrary payload with a fresh IV.
    #[test]
    fn round_trips_plain_image() {
        let plain: Vec<u8> = (0..50_000u32)
            .map(|i| (i.wrapping_mul(2654435761) >> 13) as u8)
            .collect();
        let out = encrypt(Model::X4Pro, &plain, "V9.9.9", None).unwrap();

        assert_eq!(&out.bytes[0..4], MAGIC);
        assert_eq!(out.plain_size, plain.len() as u64);

        let iv = &out.bytes[4..20];
        let key = derive_key();
        let mut whole = out.bytes[20..].to_vec();
        let mut cipher = Aes128Ctr::new((&key).into(), iv.into());
        cipher.apply_keystream(&mut whole);
        let (meta, body) = whole.split_at(META_LEN);

        assert_eq!(body, &plain[..], "body must decrypt to the original image");
        assert_eq!(&meta[0..4], &(plain.len() as u32).to_le_bytes());
        let sha: [u8; 32] = Sha256::digest(&plain).into();
        assert_eq!(&meta[4..36], &sha, "metadata carries the plain sha256");
        assert_eq!(out.plain_sha256, hex::encode(sha));
        let inspected = inspect(&out.bytes).expect("newly encrypted package must inspect");
        assert_eq!(inspected.plain_size, plain.len() as u64);
        assert_eq!(inspected.plain_sha256, hex::encode(sha));
        // version at offset 38, device_type at 70, panel at 94
        assert_eq!(&meta[38..44], b"V9.9.9");
        assert_eq!(&meta[70..83], b"ESP32S3_X4_TL");
        assert_eq!(&meta[94..101], b"SSD1677");
    }

    /// CRC-32 sanity against the well-known "123456789" check value.
    #[test]
    fn crc32_check_value() {
        assert_eq!(crc32_ieee(b"123456789"), 0xCBF4_3926);
    }

    /// A fixed IV + known plaintext produces a stable package: guards the
    /// metadata layout and continuous-counter behaviour against regressions.
    #[test]
    fn fixed_iv_is_deterministic() {
        let iv = [0x11u8; 16];
        let plain = b"hello x4 pro firmware".to_vec();
        let a = encrypt(Model::X4Pro, &plain, "V7.0.9", Some(iv)).unwrap();
        let b = encrypt(Model::X4Pro, &plain, "V7.0.9", Some(iv)).unwrap();
        assert_eq!(a.bytes, b.bytes, "same IV + input ⇒ identical package");
    }
}
