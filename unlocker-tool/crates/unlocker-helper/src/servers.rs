//! Spoofing server lifecycle, owned by the helper.
//!
//! The unprivileged main process can't bind ports 53/80/443 on macOS, so we
//! run DNS, HTTP, and HTTPS in the helper (root) and the main process drives
//! us via RPC. Notify channels for "manifest hit" / "firmware streamed" are
//! exposed to the main as blocking RPC ops.

use anyhow::{anyhow, Result};
use std::net::Ipv4Addr;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};
use unlocker_core::cert::SelfSignedCert;
use unlocker_core::dns::{self, DnsConfig, DnsHandle};
use unlocker_core::http::{self, ServerConfig, ServerHandles};
use unlocker_core::types::ArmServerSpec;

/// Let's Encrypt cert for unlocker.crosspointreader.com — trusted by ESP32's
/// CA bundle, so both stock Xteink and CrossPoint firmware accept it.
const BUNDLED_CERT_PEM: &str = include_str!("../certs/fullchain.pem");
const BUNDLED_KEY_PEM: &str = include_str!("../certs/privkey.pem");

pub struct ServerSet {
    dns: Option<DnsHandle>,
    http: Option<ServerHandles>,
    pub on_manifest: Arc<Notify>,
    pub on_firmware: Arc<Notify>,
}

#[derive(Default)]
pub struct ServerHolder {
    inner: Mutex<Option<ServerSet>>,
}

impl ServerHolder {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub async fn arm(&self, spec: ArmServerSpec) -> Result<()> {
        let mut guard = self.inner.lock().await;
        // Disarm any leftover servers from a previous run.
        if let Some(mut old) = guard.take() {
            tracing::info!("disarming previous servers before re-arming");
            if let Some(h) = old.http.take() {
                h.shutdown().await;
            }
            if let Some(d) = old.dns.take() {
                d.shutdown().await;
            }
        }

        let bridge_ip: Ipv4Addr = spec
            .bridge_ip
            .parse()
            .map_err(|_| anyhow!("invalid bridge_ip: {}", spec.bridge_ip))?;

        let cert = SelfSignedCert {
            cert_pem: BUNDLED_CERT_PEM.to_string(),
            key_pem: BUNDLED_KEY_PEM.to_string(),
        };

        let dns_cfg = DnsConfig::for_locale(spec.locale, bridge_ip, spec.dns_internal_port);
        let dns_handle = dns::start(dns_cfg.clone()).await?;

        // On Windows, ICS owns port 53 on the bridge IP. Bridge our DNS
        // spoofing through the system hosts file so the ICS DNS proxy
        // resolves the spoofed names to the bridge IP.
        #[cfg(windows)]
        crate::ops::hosts_arm(&dns_cfg.spoofed_hosts, bridge_ip).await?;

        let on_manifest = Arc::new(Notify::new());
        let on_firmware = Arc::new(Notify::new());

        let http_cfg = Arc::new(ServerConfig {
            bridge_ip: bridge_ip.to_string(),
            bind_ip: bridge_ip.into(),
            model: spec.model,
            locale: spec.locale,
            firmware_path: spec.firmware_path.into(),
            firmware_size: spec.firmware_size,
            firmware_sha256: spec.firmware_sha256,
            crosspoint_version: spec.crosspoint_version,
            change_log: spec.change_log,
            crosspet_http: spec.crosspet_http,
            on_manifest_request: on_manifest.clone(),
            on_firmware_streamed: on_firmware.clone(),
        });
        let http_handles = http::start(http_cfg, &cert).await?;

        *guard = Some(ServerSet {
            dns: Some(dns_handle),
            http: Some(http_handles),
            on_manifest,
            on_firmware,
        });
        tracing::info!("spoofing servers armed");
        Ok(())
    }

    pub async fn disarm(&self) -> Result<()> {
        let mut guard = self.inner.lock().await;
        if let Some(mut set) = guard.take() {
            if let Some(h) = set.http.take() {
                h.shutdown().await;
            }
            if let Some(d) = set.dns.take() {
                d.shutdown().await;
            }
            #[cfg(windows)]
            {
                let _ = crate::ops::hosts_disarm().await;
            }
            tracing::info!("spoofing servers disarmed");
        }
        Ok(())
    }

    pub async fn manifest_notify(&self) -> Option<Arc<Notify>> {
        self.inner
            .lock()
            .await
            .as_ref()
            .map(|s| s.on_manifest.clone())
    }

    pub async fn firmware_notify(&self) -> Option<Arc<Notify>> {
        self.inner
            .lock()
            .await
            .as_ref()
            .map(|s| s.on_firmware.clone())
    }
}
