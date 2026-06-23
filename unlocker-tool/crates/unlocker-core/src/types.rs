use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Model {
    X3,
    X4,
}

impl Model {
    pub fn short(&self) -> &'static str {
        match self {
            Model::X3 => "X3",
            Model::X4 => "X4",
        }
    }

    pub fn device_type(&self) -> &'static str {
        match self {
            Model::X3 => "ESP32C3_X3",
            Model::X4 => "ESP32C3_X4",
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
}
