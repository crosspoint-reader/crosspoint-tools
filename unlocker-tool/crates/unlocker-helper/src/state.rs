//! Crash-recovery state.
//!
//! Whenever the helper takes an action that needs reversing, it records the
//! action in this file *before* doing the work. On startup, we read the file
//! and reverse anything that's still flagged as in-place.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

#[cfg(unix)]
const STATE_PATH: &str = "/var/db/com.sofriendly.crosspoint.unlocker.helper.state.json";

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct HelperState {
    pub internet_sharing_active: bool,
    pub pfctl_anchor_loaded: bool,
    /// Windows-only: tracks whether the helper has appended spoofing entries to
    /// the system hosts file. Needed because Windows' ICS DNS proxy owns port
    /// 53 on the bridge IP, so we redirect lookups via the hosts file rather
    /// than binding our own DNS.
    #[serde(default)]
    pub hosts_modified: bool,
    /// macOS: the loopback-backed "Xteink Unlocker" upstream service may
    /// exist. Set before creating it, cleared once it is verifiably gone.
    #[serde(default)]
    pub adhoc_upstream: bool,
    /// macOS: original TSO/LRO settings of interfaces whose offloads we
    /// disabled. An entry stays until its settings are restored (or the
    /// interface no longer exists).
    #[serde(default)]
    pub offloads: Vec<OffloadSnapshot>,
}

/// Offload flags an interface had before the helper disabled them.
#[derive(Debug, Default, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct OffloadSnapshot {
    pub iface: String,
    pub tso4: bool,
    pub tso6: bool,
    pub lro: bool,
}

static LOCK: Mutex<()> = Mutex::const_new(());

pub fn path() -> PathBuf {
    #[cfg(unix)]
    {
        PathBuf::from(STATE_PATH)
    }
    #[cfg(windows)]
    {
        let base = std::env::var_os("ProgramData")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
        base.join("CrossPoint")
            .join("unlocker-helper")
            .join("state.json")
    }
}

pub async fn read() -> anyhow::Result<HelperState> {
    let _g = LOCK.lock().await;
    read_locked().await
}

async fn read_locked() -> anyhow::Result<HelperState> {
    match fs::read(path()).await {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HelperState::default()),
        Err(e) => Err(e.into()),
    }
}

/// Write to a temp file, sync it, then rename over the state file, so a
/// crash mid-write leaves either the old or the new state, never a torn one.
async fn write_locked(s: &HelperState) -> anyhow::Result<()> {
    let path = path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.ok();
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(s)?;
    let mut file = fs::File::create(&tmp).await?;
    file.write_all(&bytes).await?;
    file.sync_all().await?;
    drop(file);
    fs::rename(&tmp, &path).await?;
    Ok(())
}

/// Read-modify-write under one lock hold, so concurrent mutations can't
/// overwrite each other.
pub async fn mutate<F: FnOnce(&mut HelperState)>(f: F) -> anyhow::Result<()> {
    let _g = LOCK.lock().await;
    let mut s = read_locked().await?;
    f(&mut s);
    write_locked(&s).await
}

/// On helper start: reverse anything left in place by a prior crash.
pub async fn recover() -> anyhow::Result<()> {
    let s = read().await?;
    if s.pfctl_anchor_loaded {
        tracing::warn!("recovering: removing leftover pfctl anchor");
        let _ = crate::ops::pfctl_remove().await;
    }
    if s.internet_sharing_active {
        tracing::warn!("recovering: stopping leftover Internet Sharing");
        let _ = crate::ops::is_disable().await;
    }
    // Each macOS mutation is recovered on its own flag, so a crash part-way
    // through setup (service created, NAT not yet written, or pf rules gone
    // but offloads not restored) is still undone.
    #[cfg(target_os = "macos")]
    {
        if s.adhoc_upstream && !s.internet_sharing_active {
            tracing::warn!("recovering: removing leftover adhoc upstream service");
            crate::ops::remove_adhoc_upstream().await;
        }
        if !s.offloads.is_empty() && !s.pfctl_anchor_loaded {
            tracing::warn!("recovering: restoring interface offloads");
            crate::ops::restore_offloads().await;
        }
    }
    #[cfg(windows)]
    if s.hosts_modified {
        tracing::warn!("recovering: removing leftover hosts file entries");
        let _ = crate::ops::hosts_disarm().await;
    }
    Ok(())
}
