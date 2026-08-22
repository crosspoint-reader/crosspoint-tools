use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Model {
    X3,
    X4,
    /// Xteink X4 Pro — ESP32-S3 based, distinct from the C3-based X3/X4. Its OTA
    /// flow is account-bound and serves an encrypted `encrypted_v1` `.xota`
    /// package rather than a plain image (see `xota.rs`).
    X4Pro,
}

impl Model {
    pub fn short(&self) -> &'static str {
        match self {
            Model::X3 => "X3",
            Model::X4 => "X4",
            Model::X4Pro => "X4Pro",
        }
    }

    /// Value the device sends in the `device_type` *header* and reports at the
    /// firmware level. For the X4 Pro the OTA validator strcmps against this
    /// bare string (no panel suffix).
    pub fn device_type(&self) -> &'static str {
        match self {
            Model::X3 => "ESP32C3_X3",
            Model::X4 => "ESP32C3_X4",
            Model::X4Pro => "ESP32S3_X4_TL",
        }
    }

    /// True for the ESP32-S3 X4 Pro, whose OTA uses the encrypted `.xota`
    /// pipeline instead of the plain GitHub/stock manifest path.
    pub fn is_x4pro(&self) -> bool {
        matches!(self, Model::X4Pro)
    }

    /// Display panel controller. Only the X4 Pro's OTA manifest / `.xota`
    /// metadata carries this; the C3 devices don't advertise one.
    pub fn panel(&self) -> Option<&'static str> {
        match self {
            Model::X4Pro => Some("SSD1677"),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    English,
    Chinese,
}

impl Locale {
    pub fn short(&self) -> &'static str {
        match self {
            Locale::English => "EN",
            Locale::Chinese => "CH",
        }
    }

    pub fn api_host(&self) -> &'static str {
        match self {
            Locale::English => "api-prod.xteink.cc",
            Locale::Chinese => "api-prod.xteink.cn",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
    Insider,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Xteink,
    CrosspointKo,
    Crossink,
}

impl Source {
    pub fn label(&self) -> &'static str {
        match self {
            Source::Xteink => "Xteink",
            Source::CrosspointKo => "CrossPoint KO",
            Source::Crossink => "CrossInk",
        }
    }

    pub fn slug(&self) -> &'static str {
        match self {
            Source::Xteink => "xteink",
            Source::CrosspointKo => "crosspoint_ko",
            Source::Crossink => "crossink",
        }
    }
}

impl Default for Source {
    fn default() -> Self {
        Source::Xteink
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossPointRelease {
    pub id: String,
    pub channel: Channel,
    /// Human-friendly label. For stable/insider this is the version string;
    /// for beta it's the author-supplied name (e.g. "SD storage experiment").
    pub name: String,
    pub version: String,
    pub released_at: String,
    #[serde(default)]
    pub notes: String,
    pub firmware_url: String,
    pub firmware_sha256: Option<String>,
    pub size: u64,
    #[serde(default, deserialize_with = "deserialize_supported_devices")]
    pub supported_devices: Vec<Model>,
    /// Optional build variant (e.g. "tiny", "xlarge", "no_emoji"). Multiple
    /// releases may share a version but differ by variant.
    #[serde(default)]
    pub variant: Option<String>,
    #[serde(default)]
    pub source: Source,
}

/// Tolerate publishers who emit a single comma-joined string instead of a
/// proper JSON array (e.g. `["x4, x3"]` instead of `["x4", "x3"]`).
fn deserialize_supported_devices<'de, D>(de: D) -> Result<Vec<Model>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let raw: Vec<String> = Vec::deserialize(de)?;
    let mut out = Vec::with_capacity(raw.len());
    for entry in raw {
        for piece in entry.split(',') {
            let piece = piece.trim().to_ascii_lowercase();
            if piece.is_empty() {
                continue;
            }
            let model = match piece.as_str() {
                "x3" => Model::X3,
                // `x4pro` must be matched before `x4` would-be substrings; here
                // the split already isolates whole tokens, so an exact match is
                // enough. Accept a couple of spellings publishers might emit.
                "x4pro" | "x4_pro" | "x4-pro" => Model::X4Pro,
                "x4" => Model::X4,
                other => return Err(D::Error::custom(format!("unknown model {other}"))),
            };
            if !out.contains(&model) {
                out.push(model);
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub schema_version: u32,
    pub releases: Vec<CrossPointRelease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    pub model: Model,
    pub locale: Locale,
    pub release_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub ts: String,
    pub level: String,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// What the unprivileged main process tells the helper when arming.
/// Crosses the JSON-RPC boundary, so everything is serializable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArmServerSpec {
    pub bridge_ip: String,
    pub model: Model,
    pub locale: Locale,
    pub firmware_path: String,
    pub firmware_size: u64,
    pub firmware_sha256: String,
    pub crosspoint_version: String,
    pub change_log: String,
    pub dns_internal_port: u16,
    /// When true, serve crosspet devices a plain-HTTP firmware download URL
    /// instead of HTTPS. crosspet's `esp_https_ota` over TLS has been observed
    /// to abort the OTA early on memory-constrained devices; HTTP sidesteps the
    /// mbedTLS heap pressure. User-controlled via a Settings toggle. Defaults
    /// to false (HTTPS) until HTTP OTA support is confirmed on the hardware.
    #[serde(default)]
    pub crosspet_http: bool,
    /// Capture-only mode: arm DNS + HTTP + HTTPS and log every request the
    /// device makes, but never offer an update. All update-check endpoints
    /// answer "no update available", so the device checks in (revealing its
    /// real `device_id`, headers, and which endpoints it hits) and then goes
    /// away without downloading or flashing anything. Used by the Settings
    /// "capture device traffic" button to reverse-engineer devices (e.g. the
    /// X4 Pro's account-bound update flow) without running an install.
    #[serde(default)]
    pub capture_only: bool,
    /// X4 Pro encrypted-OTA artifacts, one per supported OTA channel. Empty for
    /// the plain-image X3/X4/CrossPoint path.
    #[serde(default)]
    pub xota_variants: Vec<XotaOta>,
}

/// One channel-specific X4 Pro `encrypted_v1` artifact plus the plaintext
/// identity surfaced in the `check-update` manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XotaOta {
    /// Channel selected by the device (`0` normal or `1` alternate).
    pub ota_type: u8,
    /// Cached encrypted package served for this channel.
    pub firmware_path: String,
    pub firmware_size: u64,
    pub firmware_sha256: String,
    /// Byte length of the decrypted (plain) app image.
    pub plain_size: u64,
    /// Lowercase hex sha256 of the decrypted (plain) app image.
    pub plain_sha256: String,
    /// CRC-32 (IEEE) of the served `.xota` package — advertised in the
    /// manifest's `checksum` object for the device's transport integrity check.
    pub xota_crc32: u32,
}
