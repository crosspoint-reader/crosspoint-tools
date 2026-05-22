//! Linux privileged operations.
//!
//! Wi-Fi hotspot bring-up/teardown is handled via NetworkManager over D-Bus
//! (zbus). NM's `ipv4.method=shared` takes care of NAT + DHCP (via dnsmasq)
//! automatically, so we don't need to manage those daemons directly.
//!
//! Port-redirect for DNS (53 → our spoofing listener) is done with a transient
//! `iptables` PREROUTING DNAT rule, tried first; if the system uses `nftables`
//! only, we fall back to `nft`. Both are attempted at cleanup.
//!
//! DHCP leases are read from dnsmasq's lease file which NM writes to
//! `/var/lib/NetworkManager/dnsmasq-<iface>.leases` or the classic path
//! `/var/lib/misc/dnsmasq.leases`; we probe both.

use crate::proto::DhcpLease;
use crate::state;
use anyhow::{anyhow, bail, Context, Result};
use std::collections::HashMap;
use std::ops::Deref;
use tokio::process::Command;
use zbus::zvariant::{OwnedObjectPath, Value};

// ── D-Bus constants ───────────────────────────────────────────────────────────

const NM_BUS: &str = "org.freedesktop.NetworkManager";
const NM_PATH: &str = "/org/freedesktop/NetworkManager";
const NM_IFACE: &str = "org.freedesktop.NetworkManager";
const NM_SETTINGS_PATH: &str = "/org/freedesktop/NetworkManager/Settings";
const NM_SETTINGS_IFACE: &str = "org.freedesktop.NetworkManager.Settings";
const NM_DEVICE_IFACE: &str = "org.freedesktop.NetworkManager.Device";

// ── Connection profile tags ───────────────────────────────────────────────────

/// The id we assign to the ephemeral hotspot connection so we can find and
/// remove it again on teardown.
const CONN_ID: &str = "xteink-unlocker-hotspot";

// A fixed UUID for our ephemeral hotspot profile.  Using a constant avoids
// pulling in the `uuid` crate and makes the profile easy to locate by UUID
// as well as by id if needed.
const CONN_UUID: &str = "d3b8e4c2-1f4a-4e7b-8a9c-0f1e2d3c4b5a";

// ── NM device type constants ──────────────────────────────────────────────────

/// NM_DEVICE_TYPE_WIFI = 2
const NM_DEVICE_TYPE_WIFI: u32 = 2;

// ── iptables / nftables constants ─────────────────────────────────────────────

const NFT_TABLE: &str = "xteink_unlocker";

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn sh(prog: &str, args: &[&str]) -> Result<String> {
    let out = Command::new(prog)
        .args(args)
        .output()
        .await
        .with_context(|| format!("spawn {prog} {args:?}"))?;
    if !out.status.success() {
        bail!(
            "{prog} {args:?} failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

async fn system_bus() -> Result<zbus::Connection> {
    zbus::Connection::system()
        .await
        .context("connecting to D-Bus system bus")
}

// ── Wi-Fi device discovery ────────────────────────────────────────────────────

/// Return the D-Bus object path of the first Wi-Fi device NM knows about.
async fn wifi_device_path(conn: &zbus::Connection) -> Result<OwnedObjectPath> {
    let proxy = zbus::Proxy::new(conn, NM_BUS, NM_PATH, NM_IFACE)
        .await
        .context("NM proxy")?;

    let devices: Vec<OwnedObjectPath> = proxy
        .call("GetDevices", &())
        .await
        .context("NM.GetDevices")?;

    for dev_path in devices {
        let dev_proxy = zbus::Proxy::new(conn, NM_BUS, dev_path.as_str(), NM_DEVICE_IFACE)
            .await
            .context("device proxy")?;

        let dev_type: u32 = match dev_proxy.get_property("DeviceType").await {
            Ok(t) => t,
            Err(e) => {
                tracing::debug!(%dev_path, "DeviceType error: {e}");
                continue;
            }
        };

        if dev_type == NM_DEVICE_TYPE_WIFI {
            return Ok(dev_path);
        }
    }

    Err(anyhow!("no Wi-Fi device found in NetworkManager"))
}

// ── Type aliases for the NM settings dict ────────────────────────────────────

/// Inner dict: property name → variant value.
type Inner<'a> = HashMap<&'a str, Value<'a>>;
/// Full NM connection dict: section name → property dict.
type ConnDict<'a> = HashMap<&'a str, Inner<'a>>;

// ── Hotspot connection build ──────────────────────────────────────────────────

fn build_hotspot_connection<'a>(ssid: &'a str, psk: &'a str) -> ConnDict<'a> {
    let mut connection: Inner = HashMap::new();
    connection.insert("type", Value::from("802-11-wireless"));
    connection.insert("id", Value::from(CONN_ID));
    connection.insert("uuid", Value::from(CONN_UUID));
    connection.insert("autoconnect", Value::from(false));

    let mut wireless: Inner = HashMap::new();
    // SSID must be transmitted as a byte array (ay).
    wireless.insert("mode", Value::from("ap"));
    wireless.insert("ssid", Value::from(ssid.as_bytes().to_vec()));
    // Force 2.4 GHz - the Xteink (ESP32) is 2.4 GHz only.
    wireless.insert("band", Value::from("bg"));

    let mut security: Inner = HashMap::new();
    security.insert("key-mgmt", Value::from("wpa-psk"));
    security.insert("psk", Value::from(psk));

    let mut ipv4: Inner = HashMap::new();
    // "shared" tells NM to run dnsmasq for DHCP and configure NAT.
    ipv4.insert("method", Value::from("shared"));

    let mut ipv6: Inner = HashMap::new();
    ipv6.insert("method", Value::from("ignore"));

    let mut map: ConnDict = HashMap::new();
    map.insert("connection", connection);
    map.insert("802-11-wireless", wireless);
    map.insert("802-11-wireless-security", security);
    map.insert("ipv4", ipv4);
    map.insert("ipv6", ipv6);
    map
}

// ── Remove any stale hotspot profile left from a prior run ───────────────────

async fn remove_stale_hotspot(conn: &zbus::Connection) {
    let Ok(proxy) = zbus::Proxy::new(conn, NM_BUS, NM_SETTINGS_PATH, NM_SETTINGS_IFACE).await
    else {
        return;
    };

    let Ok(connections): Result<Vec<OwnedObjectPath>, _> = proxy.call("ListConnections", &()).await
    else {
        return;
    };

    for cp in connections {
        let Ok(cp_proxy) = zbus::Proxy::new(
            conn,
            NM_BUS,
            cp.as_str(),
            "org.freedesktop.NetworkManager.Settings.Connection",
        )
        .await
        else {
            continue;
        };

        // GetSettings returns a{sa{sv}}.
        let Ok(settings): Result<HashMap<String, HashMap<String, zbus::zvariant::OwnedValue>>, _> =
            cp_proxy.call("GetSettings", &()).await
        else {
            continue;
        };

        let id = settings
            .get("connection")
            .and_then(|c| c.get("id"))
            .and_then(|v| {
                // OwnedValue derefs to Value; match on the Str variant.
                if let Value::Str(s) = v.deref() {
                    Some(s.as_str().to_owned())
                } else {
                    None
                }
            });

        if id.as_deref() == Some(CONN_ID) {
            tracing::info!(%cp, "removing stale hotspot connection profile");
            let _: Result<(), _> = cp_proxy.call("Delete", &()).await;
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

pub async fn is_enable(ssid: &str, psk: &str) -> Result<()> {
    if ssid.is_empty() {
        bail!("ssid is empty");
    }
    if psk.len() < 8 {
        bail!("psk must be ≥ 8 characters (WPA-PSK requirement)");
    }

    let dbus = system_bus().await?;

    // Clean up any leftover profile from a prior run.
    remove_stale_hotspot(&dbus).await;

    let wifi = wifi_device_path(&dbus).await?;

    // Add the new connection profile.
    let settings_proxy = zbus::Proxy::new(&dbus, NM_BUS, NM_SETTINGS_PATH, NM_SETTINGS_IFACE)
        .await
        .context("settings proxy")?;

    let conn_dict = build_hotspot_connection(ssid, psk);
    let conn_path: OwnedObjectPath = settings_proxy
        .call("AddConnection", &conn_dict)
        .await
        .map_err(|e| anyhow::anyhow!("NM.Settings.AddConnection: {e:#}"))?;
    tracing::info!(%conn_path, "hotspot connection profile added");

    // Activate the connection on the Wi-Fi device.
    let nm_proxy = zbus::Proxy::new(&dbus, NM_BUS, NM_PATH, NM_IFACE)
        .await
        .context("NM proxy")?;

    // ActivateConnection(o connection, o device, o specific_object) → o
    // We must pass each ObjectPath separately. Build a 3-tuple; zvariant
    // serialises Rust tuples as D-Bus structs, so we use a named struct
    // annotated with the correct signature to get bare `ooo` instead of `(ooo)`.
    // eprintln!("[diag] calling NM.ActivateConnection (conn={conn_path}, wifi={wifi})");
    use zbus::zvariant::ObjectPath;
    let specific: ObjectPath<'_> = ObjectPath::try_from("/").unwrap();
    let _: OwnedObjectPath = nm_proxy
        .call(
            "ActivateConnection",
            &(
                conn_path.as_ref() as ObjectPath<'_>,
                wifi.as_ref() as ObjectPath<'_>,
                specific,
            ),
        )
        .await
        .map_err(|e| anyhow::anyhow!("NM.ActivateConnection: {e:#}"))?;

    state::mutate(|s| s.internet_sharing_active = true).await?;
    tracing::info!(%ssid, "Wi-Fi hotspot activated via NetworkManager");
    Ok(())
}

pub async fn is_disable() -> Result<()> {
    let dbus = system_bus().await?;
    remove_stale_hotspot(&dbus).await;
    state::mutate(|s| s.internet_sharing_active = false).await?;
    tracing::info!("Wi-Fi hotspot deactivated");
    Ok(())
}

// ── Port redirect (iptables / nftables) ──────────────────────────────────────
//
// On Linux, NM's `ipv4.method=shared` runs dnsmasq bound to the AP bridge
// interface for DHCP; it also answers DNS on port 53. Because our spoofing
// DNS server needs to intercept those queries we add a PREROUTING DNAT rule
// that forwards UDP/TCP 53 traffic arriving on the AP bridge to the port
// our server is listening on.
//
// We try iptables first (still the most common tool in practice), then nftables.

pub async fn pfctl_add(from_port: u16, to_port: u16) -> Result<()> {
    let bridge = bridge_ip()
        .await
        .unwrap_or_else(|_| "10.42.0.1".to_string());

    let added = try_iptables_add(&bridge, from_port, to_port).await;
    if added.is_err() {
        tracing::warn!(?added, "iptables unavailable, trying nftables");
        try_nftables_add(&bridge, from_port, to_port)
            .await
            .context("adding port-redirect rule (iptables and nftables both failed)")?;
    }

    state::mutate(|s| s.pfctl_anchor_loaded = true).await?;
    tracing::info!(from_port, to_port, %bridge, "port-redirect rule installed");
    Ok(())
}

fn subnet24_for_bridge(bridge_ip: &str) -> Result<String> {
    let ip: std::net::Ipv4Addr = bridge_ip
        .parse()
        .with_context(|| format!("parse bridge IP {bridge_ip}"))?;
    let octets = ip.octets();
    Ok(format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2]))
}

async fn try_iptables_add(bridge_ip: &str, from_port: u16, to_port: u16) -> Result<()> {
    let to = to_port.to_string();
    let from = from_port.to_string();
    let dst = format!("{bridge_ip}:{to}");
    let subnet = subnet24_for_bridge(bridge_ip)?;

    // UDP
    sh(
        "iptables",
        &[
            "-t",
            "nat",
            "-A",
            "PREROUTING",
            "-s",
            &subnet,
            "-p",
            "udp",
            "--dport",
            &from,
            "-j",
            "DNAT",
            "--to-destination",
            &dst,
        ],
    )
    .await?;

    // TCP
    sh(
        "iptables",
        &[
            "-t",
            "nat",
            "-A",
            "PREROUTING",
            "-s",
            &subnet,
            "-p",
            "tcp",
            "--dport",
            &from,
            "-j",
            "DNAT",
            "--to-destination",
            &dst,
        ],
    )
    .await?;

    Ok(())
}

async fn try_nftables_add(bridge_ip: &str, from_port: u16, to_port: u16) -> Result<()> {
    let subnet = subnet24_for_bridge(bridge_ip)?;

    // Ensure our table and chain exist (idempotent).
    let _ = sh("nft", &["add", "table", "ip", NFT_TABLE]).await;
    let chain_spec = format!(
        "add chain ip {NFT_TABLE} prerouting {{ type nat hook prerouting priority -100 ; }}"
    );
    let _ = sh("nft", &[&chain_spec]).await;

    let udp_rule = format!(
        "add rule ip {NFT_TABLE} prerouting ip saddr {subnet} udp dport {from_port} dnat to {bridge_ip}:{to_port}"
    );
    sh("nft", &[&udp_rule]).await?;

    let tcp_rule = format!(
        "add rule ip {NFT_TABLE} prerouting ip saddr {subnet} tcp dport {from_port} dnat to {bridge_ip}:{to_port}"
    );
    sh("nft", &[&tcp_rule]).await?;

    Ok(())
}

pub async fn pfctl_remove() -> Result<()> {
    // Try iptables flush first; ignore errors (rules may not exist).
    let _ = try_iptables_remove().await;
    // Also attempt nftables cleanup and also ignore errors for same reason.
    let _ = try_nftables_remove().await;

    state::mutate(|s| s.pfctl_anchor_loaded = false).await?;
    tracing::info!("port-redirect rules removed");
    Ok(())
}

async fn try_iptables_remove() -> Result<()> {
    // Flush only the PREROUTING chain of the nat table; this is broad but safe
    // since this helper runs elevated and owns that table during operation.
    sh("iptables", &["-t", "nat", "-F", "PREROUTING"]).await?;
    Ok(())
}

async fn try_nftables_remove() -> Result<()> {
    // Delete the whole table we created; silently ignores if it doesn't exist.
    let _ = sh("nft", &["delete", "table", "ip", NFT_TABLE]).await;
    Ok(())
}

// ── DHCP leases ──────────────────────────────────────────────────────────────
//
// NM's dnsmasq writes leases to:
//   /var/lib/NetworkManager/dnsmasq-<iface>.leases   (modern NM, typical)
//   /var/lib/misc/dnsmasq.leases                     (classic / fallback)
//
// The file format is one lease per line:
//   <expiry-epoch> <mac> <ip> <hostname> <client-id>

pub async fn dhcpd_read() -> Result<Vec<DhcpLease>> {
    // Try the NM-specific glob first.
    let nm_dir = std::path::Path::new("/var/lib/NetworkManager");
    let mut leases = Vec::new();

    if nm_dir.is_dir() {
        if let Ok(mut rd) = tokio::fs::read_dir(nm_dir).await {
            while let Ok(Some(entry)) = rd.next_entry().await {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("dnsmasq-") && name.ends_with(".leases") {
                    if let Ok(body) = tokio::fs::read_to_string(entry.path()).await {
                        leases.extend(parse_dnsmasq_leases(&body));
                    }
                }
            }
        }
    }

    // Fallback / supplement from classic path.
    let classic = "/var/lib/misc/dnsmasq.leases";
    if leases.is_empty() {
        match tokio::fs::read_to_string(classic).await {
            Ok(body) => leases.extend(parse_dnsmasq_leases(&body)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }

    Ok(leases)
}

/// Parse the dnsmasq lease file format:
/// `<expiry> <mac> <ip> <hostname> <client-id>`
fn parse_dnsmasq_leases(body: &str) -> Vec<DhcpLease> {
    let mut out = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        // epoch (skip)
        let _ = parts.next();
        let mac = parts.next();
        let ip = parts.next();
        let hostname = parts.next();

        if let (Some(mac), Some(ip)) = (mac, ip) {
            let name = match hostname {
                Some("*") | None => None,
                Some(h) => Some(h.to_string()),
            };
            out.push(DhcpLease {
                ip: ip.to_string(),
                mac: mac.to_lowercase(),
                name,
            });
        }
    }
    out
}

// ── Bridge IP discovery ───────────────────────────────────────────────────────
//
// NM's `ipv4.method=shared` creates a bridge/virtual interface and assigns it
// a fixed IP from 10.42.0.0/24 (by default 10.42.0.1). We use `ip -4 addr`
// to find any interface in that subnet; fall back to scanning all interfaces.

pub async fn bridge_ip() -> Result<String> {
    let out = sh("ip", &["-4", "addr", "show"]).await?;
    find_hotspot_ip(&out).ok_or_else(|| anyhow!("hotspot bridge interface not found"))
}

fn find_hotspot_ip(ip_addr_output: &str) -> Option<String> {
    // NM shared mode defaults to 10.42.0.0/24.
    // We look for "inet 10.42.0." or any AP-mode bridge pattern.
    for line in ip_addr_output.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("inet ") {
            let ip = rest.split('/').next().unwrap_or("").trim();
            if ip.starts_with("10.42.") {
                return Some(ip.to_string());
            }
        }
    }
    None
}

// ── Full cleanup ──────────────────────────────────────────────────────────────

pub async fn full_cleanup() -> Result<()> {
    let s = state::read().await.unwrap_or_default();
    if s.pfctl_anchor_loaded {
        let _ = pfctl_remove().await;
    }
    if s.internet_sharing_active {
        let _ = is_disable().await;
    }
    state::mutate(|s| {
        s.internet_sharing_active = false;
        s.pfctl_anchor_loaded = false;
    })
    .await?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Unit tests (pure logic, no I/O) ──────────────────────────────────────

    #[test]
    fn parses_dnsmasq_leases() {
        let sample = "\
1715000000 38:44:be:98:3e:2c 10.42.0.42 android-device *\n\
1715000001 aa:bb:cc:dd:ee:ff 10.42.0.43 * *\n\
# comment line\n\
";
        let leases = parse_dnsmasq_leases(sample);
        assert_eq!(leases.len(), 2);
        assert_eq!(leases[0].ip, "10.42.0.42");
        assert_eq!(leases[0].mac, "38:44:be:98:3e:2c");
        assert_eq!(leases[0].name.as_deref(), Some("android-device"));
        assert_eq!(leases[1].ip, "10.42.0.43");
        assert_eq!(leases[1].name, None);
    }

    #[test]
    fn finds_hotspot_ip() {
        let sample = r#"
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 192.168.1.50/24 brd 192.168.1.255 scope global dynamic wlan0
3: ap0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 10.42.0.1/24 brd 10.42.0.255 scope global ap0
"#;
        assert_eq!(find_hotspot_ip(sample).as_deref(), Some("10.42.0.1"));
    }

    #[test]
    fn returns_none_when_no_hotspot() {
        let sample =
            "    inet 127.0.0.1/8 scope host lo\n    inet 192.168.1.5/24 scope global eth0\n";
        assert!(find_hotspot_ip(sample).is_none());
    }
}

// ── Integration tests ──────────────────────────────────────────────────────────
//
// These tests exercise the real NetworkManager D-Bus API and bring up an actual
// Wi-Fi hotspot. They require:
//
//   1. Running as root (or with polkit rules that allow NM connection management).
//   2. A Wi-Fi adapter that NM can put into AP mode (`nmcli device` shows a
//      Wi-Fi device with "disconnected" or "connected" state).
//   3. The `UNLOCKER_WIFI_INTEGRATION` environment variable set to any value.
//
// First compile with:
// ```sh
// cargo test -p unlocker-helper --no-run
// ```
//
// Then run with after findingg the newly hashed name:
// ```sh
// sudo UNLOCKER_WIFI_INTEGRATION=1 \
//  ./target/debug/deps/unlocker_helper-a467b15740e63d5f \
//  integration_tests --ignored --test-threads=1 --nocapture
// ```
//
// Or you can extract the appropriate name and run in one operation with:
// ```sh
// cargo test -p unlocker-helper --no-run --message-format=json 2>/dev/null \
//  | grep -o '"executable":"[^"]*"' \
//  | cut -d'"' -f4 \
//  | xargs -I{} sudo env UNLOCKER_WIFI_INTEGRATION=1 \
//      {} integration_tests --ignored --test-threads=1 --nocapture
// ```
//
// `--test-threads=1` is required because there is only one Wi-Fi adapter and
// the tests share NM state.  Running them in parallel will cause spurious
// failures.
//
// If a test panics mid-way, the `CleanupGuard` runs `full_cleanup` in its
// `Drop` impl so the system is returned to a clean state.  If that also fails
// (e.g. the process is killed with SIGKILL), run manually:
//   nmcli connection delete xteink-unlocker-hotspot

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::time::Duration;

    // ── Constants ─────────────────────────────────────────────────────────────

    const TEST_SSID: &str = "XteinkIntegTest";
    const TEST_PSK: &str = "intgtest123"; // ≥ 8 chars (WPA-PSK minimum)

    // ── Guard ────────────────────────────────────────────────────────────────

    /// Calls `full_cleanup` in its `Drop` impl so the hotspot is always torn
    /// down, even if the test panics.
    ///
    /// `Drop` is synchronous, so we need an async-to-sync bridge. We cannot
    /// create a second Tokio runtime on the **same thread** that is already
    /// driving the `#[tokio::test]` runtime - that panics with "cannot start a
    /// runtime from within a runtime". The fix is to spawn a **fresh OS
    /// thread**: that thread has no existing runtime context, so it can safely
    /// build its own `current_thread` runtime and call `block_on`.
    struct CleanupGuard;

    impl Drop for CleanupGuard {
        fn drop(&mut self) {
            let result = std::thread::spawn(|| {
                tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("build cleanup runtime")
                    .block_on(full_cleanup())
            })
            .join();

            match result {
                Ok(Ok(())) => {}
                Ok(Err(e)) => eprintln!("[integration] CleanupGuard: full_cleanup error: {e:#}"),
                Err(_) => eprintln!("[integration] CleanupGuard: cleanup thread panicked"),
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Returns `true` only when `UNLOCKER_WIFI_INTEGRATION` is set in the
    /// environment. Tests check this and return early (pass trivially) when it
    /// is absent, so `cargo test -- --ignored` is always safe to run.
    fn integration_enabled() -> bool {
        std::env::var("UNLOCKER_WIFI_INTEGRATION").is_ok()
    }

    /// Count how many NM connection profiles carry our `CONN_ID`. Normally 0
    /// (before enable) or 1 (while active). > 1 indicates a stale-cleanup bug.
    async fn nm_profile_count() -> usize {
        let Ok(dbus) = system_bus().await else {
            return 0;
        };
        let Ok(proxy) = zbus::Proxy::new(&dbus, NM_BUS, NM_SETTINGS_PATH, NM_SETTINGS_IFACE).await
        else {
            return 0;
        };

        let Ok(connections): Result<Vec<OwnedObjectPath>, _> =
            proxy.call("ListConnections", &()).await
        else {
            return 0;
        };

        let mut count = 0usize;
        for cp in connections {
            let Ok(cp_proxy) = zbus::Proxy::new(
                &dbus,
                NM_BUS,
                cp.as_str(),
                "org.freedesktop.NetworkManager.Settings.Connection",
            )
            .await
            else {
                continue;
            };

            let Ok(settings): Result<
                HashMap<String, HashMap<String, zbus::zvariant::OwnedValue>>,
                _,
            > = cp_proxy.call("GetSettings", &()).await
            else {
                continue;
            };

            let id = settings
                .get("connection")
                .and_then(|c| c.get("id"))
                .and_then(|v| {
                    if let Value::Str(s) = v.deref() {
                        Some(s.as_str().to_owned())
                    } else {
                        None
                    }
                });

            if id.as_deref() == Some(CONN_ID) {
                count += 1;
            }
        }
        count
    }

    /// Poll `bridge_ip()` until it succeeds or `deadline` elapses.
    async fn wait_for_bridge(deadline: Duration) -> Option<String> {
        let start = std::time::Instant::now();
        while start.elapsed() < deadline {
            if let Ok(ip) = bridge_ip().await {
                return Some(ip);
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        None
    }

    /// Poll `bridge_ip()` until it *fails* or `deadline` elapses.
    async fn wait_for_bridge_gone(deadline: Duration) -> bool {
        let start = std::time::Instant::now();
        while start.elapsed() < deadline {
            if bridge_ip().await.is_err() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        false
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// Full hotspot lifecycle: enable → verify up → disable → verify down.
    #[tokio::test]
    #[ignore = "requires root + Wi-Fi hardware + UNLOCKER_WIFI_INTEGRATION=1; see module docs"]
    async fn test_hotspot_lifecycle() {
        if !integration_enabled() {
            eprintln!("[integration] skipped: set UNLOCKER_WIFI_INTEGRATION=1 to enable");
            return;
        }

        // Start clean regardless of any prior state.
        let _ = full_cleanup().await;
        assert_eq!(nm_profile_count().await, 0, "no profiles before test");

        let _guard = CleanupGuard; // ensures teardown even on panic

        // ── Enable ───────────────────────────────────────────────────────────
        is_enable(TEST_SSID, TEST_PSK)
            .await
            .expect("is_enable should succeed");

        assert_eq!(
            nm_profile_count().await,
            1,
            "exactly one profile after enable"
        );

        // NM needs a few seconds to bring the AP interface up.
        let ip = wait_for_bridge(Duration::from_secs(15))
            .await
            .expect("hotspot bridge IP should appear within 15 s");
        eprintln!("[integration] bridge IP: {ip}");
        assert!(
            ip.starts_with("10.42."),
            "NM shared-mode gateway should be in 10.42.0.0/16, got {ip}"
        );

        // ── Disable ──────────────────────────────────────────────────────────
        is_disable().await.expect("is_disable should succeed");

        assert_eq!(nm_profile_count().await, 0, "no profiles after disable");

        let gone = wait_for_bridge_gone(Duration::from_secs(10)).await;
        assert!(gone, "bridge IP should disappear within 10 s after disable");
    }

    /// Calling `is_enable` twice must not leave duplicate profiles.
    #[tokio::test]
    #[ignore = "requires root + Wi-Fi hardware + UNLOCKER_WIFI_INTEGRATION=1; see module docs"]
    async fn test_stale_profile_cleanup() {
        if !integration_enabled() {
            eprintln!("[integration] skipped: set UNLOCKER_WIFI_INTEGRATION=1 to enable");
            return;
        }

        let _ = full_cleanup().await;
        let _guard = CleanupGuard;

        // First enable.
        is_enable(TEST_SSID, TEST_PSK)
            .await
            .expect("first is_enable");
        assert_eq!(
            nm_profile_count().await,
            1,
            "one profile after first enable"
        );

        // Second enable must remove the stale profile before adding a fresh one.
        is_enable(TEST_SSID, TEST_PSK)
            .await
            .expect("second is_enable (stale cleanup)");
        assert_eq!(
            nm_profile_count().await,
            1,
            "still exactly one profile after re-enable (stale profile was removed)"
        );

        is_disable().await.expect("is_disable");
        assert_eq!(nm_profile_count().await, 0, "no profiles after disable");
    }

    /// `full_cleanup` must remove the profile and tear down the bridge.
    #[tokio::test]
    #[ignore = "requires root + Wi-Fi hardware + UNLOCKER_WIFI_INTEGRATION=1; see module docs"]
    async fn test_full_cleanup_removes_everything() {
        if !integration_enabled() {
            eprintln!("[integration] skipped: set UNLOCKER_WIFI_INTEGRATION=1 to enable");
            return;
        }

        let _ = full_cleanup().await;
        let _guard = CleanupGuard;

        is_enable(TEST_SSID, TEST_PSK).await.expect("is_enable");

        // Verify the hotspot is genuinely up before we clean up.
        let ip = wait_for_bridge(Duration::from_secs(15)).await;
        assert!(
            ip.is_some(),
            "bridge should come up before testing full_cleanup"
        );

        full_cleanup().await.expect("full_cleanup should succeed");

        assert_eq!(
            nm_profile_count().await,
            0,
            "profile removed by full_cleanup"
        );

        let gone = wait_for_bridge_gone(Duration::from_secs(10)).await;
        assert!(gone, "bridge IP should be gone after full_cleanup");
    }
}
