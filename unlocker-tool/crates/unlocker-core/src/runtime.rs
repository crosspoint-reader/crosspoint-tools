//! Top-level lifecycle. Drives the privileged helper through three phases:
//! hotspot up → arm servers → teardown.
//!
//! Servers themselves run inside the helper (it's root, so it can bind
//! ports 53/80/443). We just sequence the RPCs and watch DHCP leases.

use crate::helper::Helper;
use crate::types::{ArmServerSpec, Locale, Model};
use anyhow::{anyhow, Result};
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::time::Duration;

/// pfctl redirects port 53 -> this on the bridge interface; the helper's
/// DNS server actually listens here. We avoid 5353 because mDNSResponder
/// binds to *:5353 for Bonjour.
pub const DNS_INTERNAL_PORT: u16 = 10053;

pub struct Runtime;

impl Runtime {
    pub fn new() -> std::sync::Arc<Self> {
        std::sync::Arc::new(Self)
    }

    /// Phase 1: create the temporary lo0-backed upstream service and write the
    /// Internet Sharing NAT plist.
    /// After this the user must enable Internet Sharing in System Settings.
    pub async fn prepare_hotspot(&self, helper: &Helper, ssid: &str, psk: &str) -> Result<()> {
        helper.is_enable(ssid, psk).await?;
        Ok(())
    }

    /// Phase 2: wait for bridge100 to come up (user has toggled Internet Sharing),
    /// then install pfctl rules. Polls indefinitely — toggling Internet Sharing
    /// is a manual user step that may take a while.
    pub async fn await_hotspot(
        &self,
        helper: &Helper,
        ssid: &str,
        psk: &str,
    ) -> Result<HotspotInfo> {
        let bridge_ip = wait_for_bridge_ip(helper).await?;
        helper.pfctl_add(53, DNS_INTERNAL_PORT).await?;
        Ok(HotspotInfo {
            ssid: ssid.to_string(),
            psk: psk.to_string(),
            bridge_ip,
        })
    }

    pub async fn arm(&self, helper: &Helper, cfg: ArmConfig) -> Result<()> {
        let spec = ArmServerSpec {
            bridge_ip: cfg.bridge_ip.to_string(),
            model: cfg.model,
            locale: cfg.locale,
            firmware_path: cfg.firmware_path.to_string_lossy().into(),
            firmware_size: cfg.firmware_size,
            firmware_sha256: cfg.firmware_sha256,
            crosspoint_version: cfg.crosspoint_version,
            change_log: cfg.change_log,
            dns_internal_port: DNS_INTERNAL_PORT,
            crosspet_http: cfg.crosspet_http,
        };
        helper.arm_servers(spec).await
    }

    pub async fn wait_for_bridge(&self, helper: &Helper) -> Result<Ipv4Addr> {
        wait_for_bridge_ip(helper).await
    }

    pub async fn teardown(&self, helper: &Helper) -> Result<()> {
        let _ = helper.disarm_servers().await;
        let _ = helper.pfctl_remove().await;
        let _ = helper.is_disable().await;
        Ok(())
    }
}

pub struct HotspotInfo {
    pub ssid: String,
    pub psk: String,
    pub bridge_ip: Ipv4Addr,
}

pub struct ArmConfig {
    pub bridge_ip: Ipv4Addr,
    pub model: Model,
    pub locale: Locale,
    pub firmware_path: PathBuf,
    pub firmware_size: u64,
    pub firmware_sha256: String,
    pub crosspoint_version: String,
    pub change_log: String,
    /// Serve crosspet devices a plain-HTTP firmware URL instead of HTTPS.
    pub crosspet_http: bool,
}

async fn wait_for_bridge_ip(helper: &Helper) -> Result<Ipv4Addr> {
    loop {
        if let Ok(ip) = helper.bridge_ip().await {
            if let Ok(parsed) = ip.parse::<Ipv4Addr>() {
                return Ok(parsed);
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

pub async fn await_device_lease(
    helper: &Helper,
    bridge_ip: Ipv4Addr,
    timeout: Duration,
) -> Result<(String, String)> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let leases = helper.dhcpd_read().await.unwrap_or_default();
        let candidates: Vec<_> = leases
            .into_iter()
            .filter(|l| lease_matches_bridge(&l.ip, bridge_ip))
            .collect();

        for l in &candidates {
            if is_espressif_mac(&l.mac) {
                return Ok((l.mac.clone(), l.ip.clone()));
            }
        }

        if candidates.len() == 1 {
            let l = &candidates[0];
            return Ok((l.mac.clone(), l.ip.clone()));
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(anyhow!("no hotspot client appeared within {timeout:?}"));
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

fn lease_matches_bridge(ip: &str, bridge_ip: Ipv4Addr) -> bool {
    let Ok(ip) = ip.parse::<Ipv4Addr>() else {
        return false;
    };
    let bridge = bridge_ip.octets();
    let lease = ip.octets();
    lease != bridge && lease[0..3] == bridge[0..3]
}

fn is_espressif_mac(mac: &str) -> bool {
    let prefix = mac
        .split(':')
        .take(3)
        .collect::<Vec<_>>()
        .join(":")
        .to_lowercase();
    matches!(
        prefix.as_str(),
        "24:0a:c4"
            | "24:6f:28"
            | "24:b2:de"
            | "24:d7:eb"
            | "30:ae:a4"
            | "34:86:5d"
            | "34:b4:72"
            | "3c:71:bf"
            | "40:91:51"
            | "44:17:93"
            | "48:3f:da"
            | "4c:11:ae"
            | "4c:75:25"
            | "54:43:b2"
            | "60:01:94"
            | "68:67:25"
            | "68:c6:3a"
            | "7c:9e:bd"
            | "7c:df:a1"
            | "80:7d:3a"
            | "84:0d:8e"
            | "84:f3:eb"
            | "8c:4b:14"
            | "90:38:0c"
            | "94:b9:7e"
            | "94:b5:55"
            | "98:cd:ac"
            | "a4:cf:12"
            | "a8:03:2a"
            | "ac:0b:fb"
            | "ac:67:b2"
            | "b4:8a:0a"
            | "b4:e6:2d"
            | "bc:dd:c2"
            | "c4:4f:33"
            | "c4:5b:be"
            | "c4:de:e2"
            | "c8:2b:96"
            | "cc:50:e3"
            | "d8:a0:1d"
            | "d8:bf:c0"
            | "dc:4f:22"
            | "e0:98:06"
            | "e8:31:cd"
            | "e8:9f:6d"
            | "ec:62:60"
            | "ec:fa:bc"
            | "f0:08:d1"
            | "f4:cf:a2"
            | "f8:f0:05"
            | "fc:f5:c4"
    )
}
