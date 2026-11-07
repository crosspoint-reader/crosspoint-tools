//! Privileged operations. Pragmatic shell-outs to system tools.
//!
//! Every state-changing op records its intent in the state file *before*
//! acting, so a crash mid-op is recoverable on next launch.
//!
//! Interface names are discovered at runtime: the Wi-Fi adapter, the
//! upstream Internet Sharing shares from (a real service when one is
//! shareable, otherwise a loopback-backed fake), and the bridge it creates
//! (identified by its Wi-Fi/`apN` member, so VM bridges are ignored).

use crate::proto::DhcpLease;
use crate::state::{self, OffloadSnapshot};
use anyhow::{anyhow, bail, Context, Result};
use std::path::Path;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use unlocker_core::types::HotspotSetup;

const NAT_PLIST: &str = "/Library/Preferences/SystemConfiguration/com.apple.nat.plist";
const NAT_PLIST_BACKUP: &str = "/var/db/com.sofriendly.crosspoint.unlocker.nat.plist.bak";
const PF_RULES_PATH: &str = "/var/db/com.sofriendly.crosspoint.unlocker.pf.conf";
const PREFS_PLIST: &str = "/Library/Preferences/SystemConfiguration/preferences.plist";
const PREFS_PLIST_BACKUP: &str = "/var/db/com.sofriendly.crosspoint.unlocker.preferences.plist.bak";

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

/// Run `scutil` with commands on stdin (it has no argv form for `show`).
async fn scutil(script: &str) -> Result<String> {
    let mut child = Command::new("scutil")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawn scutil")?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(script.as_bytes()).await?;
        stdin.write_all(b"\nquit\n").await?;
    }
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        bail!(
            "scutil failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ── Interface discovery ──────────────────────────────────────────────────────

/// One `ifconfig -a` block, reduced to what discovery needs.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct IfaceBlock {
    name: String,
    inet: Vec<String>,
    members: Vec<String>,
    /// Capability flags from the `options=…<TSO4,TSO6,…>` line.
    options: Vec<String>,
}

/// Parse `ifconfig -a` output into per-interface blocks.
fn parse_ifconfig(out: &str) -> Vec<IfaceBlock> {
    let mut blocks: Vec<IfaceBlock> = Vec::new();
    for line in out.lines() {
        let is_header = !line.starts_with([' ', '\t']) && line.contains(": flags=");
        if is_header {
            let name = line.split(':').next().unwrap_or("").trim().to_string();
            blocks.push(IfaceBlock {
                name,
                ..Default::default()
            });
            continue;
        }
        let Some(cur) = blocks.last_mut() else {
            continue;
        };
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("inet ") {
            // "inet 192.168.2.1 netmask 0xffffff00 broadcast ..."
            if let Some(ip) = rest.split_whitespace().next() {
                cur.inet.push(ip.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("member: ") {
            // "member: ap1 flags=3<LEARNING,DISCOVER>"
            if let Some(m) = rest.split_whitespace().next() {
                cur.members.push(m.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("options=") {
            // "options=6460<TSO4,TSO6,CHANNEL_IO>"
            if let Some((_, flags)) = rest.split_once('<') {
                cur.options = flags
                    .trim_end_matches('>')
                    .split(',')
                    .filter(|f| !f.is_empty())
                    .map(str::to_string)
                    .collect();
            }
        }
    }
    blocks
}

/// `ap0`, `ap1`, … — the AP-mode companion interface Apple Silicon Macs
/// enslave to the Internet Sharing bridge instead of the station `enN`.
fn is_ap_iface(name: &str) -> bool {
    name.strip_prefix("ap")
        .map(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
        .unwrap_or(false)
}

/// Pick the Internet Sharing bridge: a `bridgeN` with an IPv4 address whose
/// member set contains the Wi-Fi adapter or any `apN` interface. Returns
/// `None` while sharing is off (no such bridge exists yet).
fn find_sharing_bridge<'a>(blocks: &'a [IfaceBlock], wifi: Option<&str>) -> Option<&'a IfaceBlock> {
    blocks.iter().find(|b| {
        b.name.starts_with("bridge")
            && !b.inet.is_empty()
            && b
                .members
                .iter()
                .any(|m| Some(m.as_str()) == wifi || is_ap_iface(m))
    })
}

fn no_bridge_error(blocks: &[IfaceBlock], wifi: Option<&str>) -> anyhow::Error {
    let bridges: Vec<String> = blocks
        .iter()
        .filter(|b| b.name.starts_with("bridge"))
        .map(|b| format!("{}[{}]", b.name, b.members.join(",")))
        .collect();
    anyhow!(
        "no Internet Sharing bridge yet (wifi={}, bridges={})",
        wifi.unwrap_or("?"),
        if bridges.is_empty() {
            "none".to_string()
        } else {
            bridges.join(" ")
        }
    )
}

/// Interfaces that can never be a sensible "share from" upstream.
fn is_shareable_upstream(dev: &str, wifi: &str) -> bool {
    if dev.is_empty() || dev == wifi {
        return false;
    }
    const VIRTUAL_PREFIXES: &[&str] = &[
        "lo", "bridge", "vmenet", "feth", "utun", "ipsec", "gif", "stf", "ap", "awdl", "llw",
        "nan", "anpi", "pktap",
    ];
    !VIRTUAL_PREFIXES.iter().any(|p| {
        dev.strip_prefix(p)
            .map(|rest| rest.bytes().all(|b| b.is_ascii_digit()))
            .unwrap_or(false)
    })
}

/// Value of `key` in `scutil` `show` output (`  Key : value` lines).
fn scutil_value(scutil_out: &str, key: &str) -> Option<String> {
    scutil_out.lines().find_map(|l| {
        let (k, v) = l.trim().split_once(" : ")?;
        (k == key)
            .then(|| v.trim().to_string())
            .filter(|v| !v.is_empty())
    })
}

/// One entry of `networksetup -listnetworkserviceorder`.
#[derive(Debug, Clone, PartialEq, Eq)]
struct NetService {
    name: String,
    device: String,
    enabled: bool,
}

/// Parse `networksetup -listnetworkserviceorder`, whose output alternates
/// `(N) Service Name` (or `(*) Name` when disabled) with
/// `(Hardware Port: …, Device: enX)` lines.
fn parse_service_order(order_out: &str) -> Vec<NetService> {
    let mut services = Vec::new();
    let mut pending: Option<(String, bool)> = None;
    for line in order_out.lines() {
        let line = line.trim();
        if line.starts_with("(Hardware Port:") {
            if let Some((name, enabled)) = pending.take() {
                let device = line
                    .split("Device:")
                    .nth(1)
                    .map(|d| d.trim().trim_end_matches(')').trim())
                    .unwrap_or("")
                    .to_string();
                services.push(NetService {
                    name,
                    device,
                    enabled,
                });
            }
        } else if let Some(rest) = line.strip_prefix('(') {
            if let Some((index, name)) = rest.split_once(')') {
                let name = name.trim();
                if !name.is_empty() {
                    pending = Some((name.to_string(), index != "*"));
                }
            }
        }
    }
    services
}

/// Name of the first *enabled* service on `device`. A device can carry
/// several services (e.g. a disabled duplicate), and only an enabled one
/// is offered in the Sharing picker.
fn enabled_service_for_device<'a>(services: &'a [NetService], device: &str) -> Option<&'a str> {
    services
        .iter()
        .find(|s| s.enabled && s.device == device)
        .map(|s| s.name.as_str())
}

/// First enabled service, in the user's service order, whose device can be
/// shared from and currently holds a routable IPv4 address. Covers a primary
/// interface that can't be shared, such as a VPN `utun` over Ethernet.
fn pick_active_service<'a>(
    services: &'a [NetService],
    blocks: &[IfaceBlock],
    wifi: &str,
) -> Option<&'a NetService> {
    services.iter().find(|s| {
        s.enabled
            && is_shareable_upstream(&s.device, wifi)
            && blocks.iter().any(|b| {
                b.name == s.device && b.inet.iter().any(|ip| !ip.starts_with("169.254."))
            })
    })
}

// ── Internet Sharing ─────────────────────────────────────────────────────────

const ADHOC_SERVICE_NAME: &str = "Xteink Unlocker";
const ADHOC_IP: &str = "10.10.10.1";
const LOOPBACK_IP: &str = "127.0.0.1";
const LOOPBACK_NETMASK: &str = "0xff000000";

async fn restore_loopback() {
    let _ = sh(
        "ifconfig",
        &[
            "lo0",
            "inet",
            LOOPBACK_IP,
            "netmask",
            LOOPBACK_NETMASK,
            "up",
        ],
    )
    .await;
    let _ = sh("ifconfig", &["lo0", "-alias", ADHOC_IP]).await;
}

/// Create a fake network service on lo0 so Internet Sharing sees an
/// "active" upstream even though there's no real internet connection.
async fn create_adhoc_upstream() -> Result<()> {
    // Remove stale service if it exists from a prior run.
    let _ = sh(
        "networksetup",
        &["-removenetworkservice", ADHOC_SERVICE_NAME],
    )
    .await;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Create may fail if it already exists (race or incomplete cleanup).
    match sh(
        "networksetup",
        &["-createnetworkservice", ADHOC_SERVICE_NAME, "lo0"],
    )
    .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(?e, "createnetworkservice failed, may already exist");
        }
    }
    // Set the IP regardless — works even if the service already existed.
    sh(
        "networksetup",
        &[
            "-setmanual",
            ADHOC_SERVICE_NAME,
            ADHOC_IP,
            "255.255.255.255",
        ],
    )
    .await?;
    tracing::info!("adhoc upstream service ready on lo0");
    Ok(())
}

/// Remove the fake upstream service. Idempotent. The state flag is cleared
/// only once preferences.plist verifiably no longer lists the service, so a
/// failed purge is retried on the next launch.
pub async fn remove_adhoc_upstream() {
    let _ = sh(
        "networksetup",
        &["-removenetworkservice", ADHOC_SERVICE_NAME],
    )
    .await;
    // networksetup refuses to remove the last service on lo0 ("you cannot
    // remove ... because there aren't any other network services on
    // Loopback"), leaving an orphaned entry in preferences.plist that the
    // GUI can't delete either (System Settings crashes). Surgically remove
    // any leftover entry from the plist directly.
    let purged = purge_adhoc_from_prefs_plist().await;
    restore_loopback().await;
    match purged {
        Ok(()) => {
            let _ = state::mutate(|s| s.adhoc_upstream = false).await;
            tracing::info!("removed adhoc upstream service");
        }
        Err(e) => {
            tracing::warn!(?e, "failed to purge adhoc service from preferences.plist");
        }
    }
}

/// Remove orphaned "Xteink Unlocker" entries from
/// /Library/Preferences/SystemConfiguration/preferences.plist when
/// `networksetup -removenetworkservice` couldn't.
async fn purge_adhoc_from_prefs_plist() -> Result<()> {
    use plist::Value;

    if !Path::new(PREFS_PLIST).exists() {
        return Ok(());
    }

    let bytes = tokio::fs::read(PREFS_PLIST).await?;
    let mut root: Value = plist::from_bytes(&bytes).context("parse preferences.plist")?;

    let root_dict = root
        .as_dictionary_mut()
        .ok_or_else(|| anyhow!("preferences.plist root is not a dictionary"))?;

    // Find UUIDs of services whose UserDefinedName matches ours.
    let mut victim_uuids: Vec<String> = Vec::new();
    if let Some(services) = root_dict
        .get("NetworkServices")
        .and_then(|v| v.as_dictionary())
    {
        for (uuid, svc) in services {
            if let Some(name) = svc
                .as_dictionary()
                .and_then(|d| d.get("UserDefinedName"))
                .and_then(|v| v.as_string())
            {
                if name == ADHOC_SERVICE_NAME {
                    victim_uuids.push(uuid.clone());
                }
            }
        }
    }

    if victim_uuids.is_empty() {
        return Ok(());
    }

    // Back up once before mutating.
    if !Path::new(PREFS_PLIST_BACKUP).exists() {
        tokio::fs::copy(PREFS_PLIST, PREFS_PLIST_BACKUP).await.ok();
    }

    // Remove from NetworkServices.
    if let Some(services) = root_dict
        .get_mut("NetworkServices")
        .and_then(|v| v.as_dictionary_mut())
    {
        for uuid in &victim_uuids {
            services.remove(uuid);
        }
    }

    // Remove references from each Set's Network.Service dict and ServiceOrder.
    if let Some(sets) = root_dict
        .get_mut("Sets")
        .and_then(|v| v.as_dictionary_mut())
    {
        for (_set_uuid, set_val) in sets.iter_mut() {
            let Some(set_dict) = set_val.as_dictionary_mut() else {
                continue;
            };
            let Some(network) = set_dict
                .get_mut("Network")
                .and_then(|v| v.as_dictionary_mut())
            else {
                continue;
            };

            if let Some(svc_dict) = network
                .get_mut("Service")
                .and_then(|v| v.as_dictionary_mut())
            {
                for uuid in &victim_uuids {
                    svc_dict.remove(uuid);
                }
            }

            if let Some(global) = network
                .get_mut("Global")
                .and_then(|v| v.as_dictionary_mut())
            {
                if let Some(order) = global
                    .get_mut("ServiceOrder")
                    .and_then(|v| v.as_array_mut())
                {
                    order.retain(|item| {
                        item.as_string()
                            .map(|s| !victim_uuids.iter().any(|u| u == s))
                            .unwrap_or(true)
                    });
                }
            }
        }
    }

    let mut buf = Vec::new();
    plist::to_writer_xml(&mut buf, &root).context("serialize preferences.plist")?;
    tokio::fs::write(PREFS_PLIST, buf).await?;

    tracing::info!(
        count = victim_uuids.len(),
        "purged orphaned Xteink Unlocker entries from preferences.plist"
    );
    Ok(())
}

async fn wifi_device() -> Result<String> {
    let out = sh("networksetup", &["-listallhardwareports"]).await?;
    let mut in_wifi_block = false;

    for line in out.lines() {
        let line = line.trim();
        if let Some(port) = line.strip_prefix("Hardware Port: ") {
            in_wifi_block = port == "Wi-Fi" || port == "AirPort";
            continue;
        }

        if in_wifi_block {
            if let Some(device) = line.strip_prefix("Device: ") {
                let device = device.trim();
                if !device.is_empty() {
                    return Ok(device.to_string());
                }
            }
        }
    }

    Err(anyhow!("could not find Wi-Fi hardware device"))
}

/// Resolved upstream for Internet Sharing's "share your connection from".
struct Upstream {
    device: String,
    service: Option<String>,
    adhoc: bool,
}

/// Prefer a real interface (Ethernet, USB LAN, tethered phone…) as the
/// upstream. Wi-Fi itself can't be the upstream because it is about to
/// become the access point. If nothing usable exists, build the
/// loopback-backed fake service so Internet Sharing has *something* to share.
async fn discover_upstream(wifi: &str) -> Result<Upstream> {
    if let Some((device, service)) = find_real_upstream(wifi).await {
        tracing::info!(%device, %service, "using real interface as upstream");
        // A stale fake service from a previous run would show up next to
        // the real one in the Sharing picker; clear it.
        remove_adhoc_upstream().await;
        return Ok(Upstream {
            device,
            service: Some(service),
            adhoc: false,
        });
    }

    tracing::info!(%wifi, "no shareable internet interface (Wi-Fi-only or offline); using adhoc upstream");
    state::mutate(|s| s.adhoc_upstream = true).await?;
    create_adhoc_upstream().await?;
    Ok(Upstream {
        device: "lo0".to_string(),
        service: Some(ADHOC_SERVICE_NAME.to_string()),
        adhoc: true,
    })
}

/// `(device, service name)` to share from: the primary IPv4 service when its
/// interface is shareable, otherwise the first active shareable service in
/// the user's service order.
async fn find_real_upstream(wifi: &str) -> Option<(String, String)> {
    let global = scutil("show State:/Network/Global/IPv4")
        .await
        .map_err(|e| tracing::warn!(?e, "scutil primary-service lookup failed"))
        .unwrap_or_default();
    let services = match sh("networksetup", &["-listnetworkserviceorder"]).await {
        Ok(out) => parse_service_order(&out),
        Err(e) => {
            tracing::warn!(?e, "listnetworkserviceorder failed");
            return None;
        }
    };

    if let Some(device) =
        scutil_value(&global, "PrimaryInterface").filter(|d| is_shareable_upstream(d, wifi))
    {
        // Name the primary service by its ID rather than by device: several
        // services can share one device.
        let mut name = None;
        if let Some(id) = scutil_value(&global, "PrimaryService") {
            if let Ok(out) = scutil(&format!("show Setup:/Network/Service/{id}")).await {
                name = scutil_value(&out, "UserDefinedName");
            }
        }
        if let Some(name) =
            name.or_else(|| enabled_service_for_device(&services, &device).map(str::to_string))
        {
            return Some((device, name));
        }
        tracing::warn!(%device, "primary interface has no enabled network service");
    }

    let blocks = match sh("ifconfig", &["-a"]).await {
        Ok(out) => parse_ifconfig(&out),
        Err(e) => {
            tracing::warn!(?e, "ifconfig failed");
            return None;
        }
    };
    pick_active_service(&services, &blocks, wifi).map(|s| (s.device.clone(), s.name.clone()))
}

pub async fn is_enable(ssid: &str, psk: &str) -> Result<HotspotSetup> {
    // Back up the existing plist if we haven't already.
    if Path::new(NAT_PLIST).exists() && !Path::new(NAT_PLIST_BACKUP).exists() {
        tokio::fs::copy(NAT_PLIST, NAT_PLIST_BACKUP).await.ok();
    }

    tracing::info!("stopping existing NetworkSharing");
    let _ = sh("launchctl", &["bootout", "system/com.apple.NetworkSharing"]).await;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Discover the adapters *before* touching Wi-Fi: once we bounce the radio
    // the primary interface may briefly flip.
    let wifi = wifi_device().await?;
    let upstream = discover_upstream(&wifi).await?;

    // Disconnect Wi-Fi from the current network. Internet Sharing needs to
    // reconfigure Wi-Fi from client mode to AP mode — it can't do that while
    // associated with a network. We leave the radio on.
    tracing::info!(%wifi, "disconnecting Wi-Fi from current network");
    let _ = sh("networksetup", &["-setairportpower", &wifi, "off"]).await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let _ = sh("networksetup", &["-setairportpower", &wifi, "on"]).await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    // Write NAT plist so Internet Sharing is pre-configured when the user
    // enables it in System Settings. Flag it first: is_disable restores the
    // backup (or removes the file), which is correct even if the write
    // never happened.
    state::mutate(|s| s.internet_sharing_active = true).await?;
    tracing::info!(%ssid, %wifi, upstream = %upstream.device, adhoc = upstream.adhoc, "writing NAT plist");
    write_nat_plist(&upstream.device, &wifi, ssid, psk).await?;

    tracing::info!(%ssid, "Internet Sharing configured — user must enable in System Settings");
    Ok(HotspotSetup {
        upstream_device: Some(upstream.device),
        upstream_service: upstream.service,
        upstream_adhoc: upstream.adhoc,
    })
}

pub async fn is_disable() -> Result<()> {
    let _ = sh("launchctl", &["bootout", "system/com.apple.NetworkSharing"]).await;

    // Restore the prior plist if we backed one up.
    let restored = if Path::new(NAT_PLIST_BACKUP).exists() {
        tokio::fs::rename(NAT_PLIST_BACKUP, NAT_PLIST)
            .await
            .context("restore NAT plist")
    } else {
        match tokio::fs::remove_file(NAT_PLIST).await {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                Err(e).context("remove NAT plist")
            }
            _ => Ok(()),
        }
    };

    // Remove the fake upstream service.
    remove_adhoc_upstream().await;

    // On failure the flag stays set so the next launch retries.
    restored?;
    state::mutate(|s| s.internet_sharing_active = false).await?;
    tracing::info!("Internet Sharing disabled");
    Ok(())
}

async fn write_nat_plist(upstream: &str, wifi_device: &str, ssid: &str, psk: &str) -> Result<()> {
    use plist::Value;
    let mut airport = plist::Dictionary::new();
    airport.insert("40BitEncrypt".into(), Value::Integer(0i64.into()));
    airport.insert("Channel".into(), Value::Integer(11i64.into()));
    airport.insert("Enabled".into(), Value::Integer(1i64.into()));
    airport.insert("NetworkName".into(), Value::String(ssid.to_string()));
    airport.insert(
        "NetworkPassword".into(),
        Value::Data(psk.as_bytes().to_vec()),
    );

    let mut nat = plist::Dictionary::new();
    nat.insert("Enabled".into(), Value::Integer(1i64.into()));
    nat.insert(
        "SharingDevices".into(),
        Value::Array(vec![Value::String(wifi_device.to_string())]),
    );
    nat.insert(
        "PrimaryInterface".into(),
        Value::Dictionary({
            let mut p = plist::Dictionary::new();
            p.insert("Device".into(), Value::String(upstream.to_string()));
            p.insert("Enabled".into(), Value::Integer(1i64.into()));
            p
        }),
    );
    nat.insert("AirPort".into(), Value::Dictionary(airport));

    let mut root = plist::Dictionary::new();
    root.insert("NAT".into(), Value::Dictionary(nat));

    let bytes = {
        let mut buf = Vec::new();
        plist::to_writer_xml(&mut buf, &Value::Dictionary(root))?;
        buf
    };
    if let Some(parent) = Path::new(NAT_PLIST).parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(NAT_PLIST, bytes).await?;
    Ok(())
}

// ── pfctl (DNS port redirect) ────────────────────────────────────────────────

pub async fn pfctl_add(from_port: u16, to_port: u16) -> Result<()> {
    // Only called once the bridge exists; never guess an interface, since a
    // VM bridge can hold the name and subnet the hotspot used to.
    let wifi = wifi_device().await.ok();
    let blocks = parse_ifconfig(&sh("ifconfig", &["-a"]).await?);
    let bridge = find_sharing_bridge(&blocks, wifi.as_deref())
        .ok_or_else(|| no_bridge_error(&blocks, wifi.as_deref()))?;
    let iface = bridge.name.as_str();
    let ip = &bridge.inet[0];

    // The explicit ICMP pass for type 3 code 4 (fragmentation-needed) keeps
    // Path-MTU Discovery working through our redirect, so big firmware
    // transfers can recover if the device guesses too high.
    // pf requires rules in a fixed order: options, normalization, queueing,
    // translation (rdr/nat), then filtering (pass/block). The rdr rules must
    // come before the icmp pass.
    let rules = format!(
        "rdr pass on {iface} inet proto udp from any to any port {from} -> {ip} port {to}\n\
         rdr pass on {iface} inet proto tcp from any to any port {from} -> {ip} port {to}\n\
         pass on {iface} inet proto icmp icmp-type 3 code 4\n",
        iface = iface,
        from = from_port,
        to = to_port,
        ip = ip,
    );
    tokio::fs::write(PF_RULES_PATH, &rules).await?;

    // Offloads are disabled on the bridge, on every interface it forwards
    // through (`apN` on Apple Silicon, the Wi-Fi NIC on Intel), and on the
    // Wi-Fi NIC. Their current settings are recorded before anything changes.
    let mut targets: Vec<&str> = vec![iface];
    targets.extend(bridge.members.iter().map(String::as_str));
    targets.extend(wifi.as_deref());
    let snapshots: Vec<OffloadSnapshot> = blocks
        .iter()
        .filter(|b| targets.contains(&b.name.as_str()))
        .map(offload_snapshot)
        .collect();
    state::mutate(|s| {
        s.pfctl_anchor_loaded = true;
        merge_offloads(&mut s.offloads, &snapshots);
    })
    .await?;

    // Load into the Internet Sharing anchor which is already referenced
    // in the main ruleset — this piggybacks on Apple's existing anchor point.
    sh(
        "pfctl",
        &["-a", "com.apple.internet-sharing", "-f", PF_RULES_PATH],
    )
    .await?;

    // Enable pf if not already enabled.
    let _ = sh("pfctl", &["-E"]).await;

    // Flush the global state table. Without this, leftover TCP flow entries
    // from a previous run (cancelled mid-OTA, force-quit, etc.) can match
    // the device's new connections and silently misroute them — a known
    // cause of "first attempt fails, reboot fixes it" reports.
    let _ = sh("pfctl", &["-F", "states"]).await;

    // Pin the bridge MTU to 1500. A lo0 fake upstream has MTU 16384, which
    // can poison PMTU discovery on the return path: the manifest fits in one
    // packet (works fine) but the multi-MB firmware download gets blackholed
    // by oversize segments. 1500 matches the device's Wi-Fi link.
    let _ = sh("ifconfig", &[iface, "mtu", "1500"]).await;

    // Disable TCP Segmentation Offload + Large Receive Offload on the bridge
    // and the underlying Wi-Fi NIC. Apple Silicon Wi-Fi drivers hand the NIC
    // 64KB super-segments that the bridge forward path mis-resegments,
    // killing large transfers (firmware) while small ones (manifest) get
    // through. Intel Macs don't show the bug. Teardown restores the
    // recorded settings.
    for snap in &snapshots {
        disable_offload(snap).await;
    }

    tracing::info!(from_port, to_port, bridge = %iface, %ip, "pfctl rules loaded via internet-sharing anchor");
    Ok(())
}

fn offload_snapshot(block: &IfaceBlock) -> OffloadSnapshot {
    let has = |flag: &str| block.options.iter().any(|o| o == flag);
    OffloadSnapshot {
        iface: block.name.clone(),
        tso4: has("TSO4"),
        tso6: has("TSO6"),
        lro: has("LRO"),
    }
}

/// `(enabled, ifconfig flag name)` for each offload we manage.
fn offload_flags(snap: &OffloadSnapshot) -> [(bool, &'static str); 3] {
    [(snap.tso4, "tso4"), (snap.tso6, "tso6"), (snap.lro, "lro")]
}

/// Record snapshots for interfaces not seen yet. An existing entry holds the
/// settings from before our first change; a repeat `pfctl_add` must not
/// replace it with the already-disabled flags.
fn merge_offloads(saved: &mut Vec<OffloadSnapshot>, new: &[OffloadSnapshot]) {
    for snap in new {
        if !saved.iter().any(|s| s.iface == snap.iface) {
            saved.push(snap.clone());
        }
    }
}

async fn disable_offload(snap: &OffloadSnapshot) {
    // Not every driver accepts every flag; ignore individual failures.
    for (on, flag) in offload_flags(snap) {
        if on {
            let _ = sh("ifconfig", &[&snap.iface, &format!("-{flag}")]).await;
        }
    }
}

/// Re-enable the offloads recorded by `pfctl_add`, and only those that were
/// on before. Interfaces that no longer exist need nothing (Internet Sharing
/// destroys its bridge and `apN`); entries that fail to restore stay in the
/// state file for the next launch.
pub async fn restore_offloads() {
    let saved = state::read().await.map(|s| s.offloads).unwrap_or_default();
    if saved.is_empty() {
        return;
    }
    let blocks = match sh("ifconfig", &["-a"]).await {
        Ok(out) => parse_ifconfig(&out),
        Err(e) => {
            tracing::warn!(?e, "ifconfig failed; offload restore deferred");
            return;
        }
    };

    let mut pending = Vec::new();
    for snap in saved {
        let Some(block) = blocks.iter().find(|b| b.name == snap.iface) else {
            continue;
        };
        let current = offload_snapshot(block);
        let mut ok = true;
        for ((want, flag), (have, _)) in offload_flags(&snap).into_iter().zip(offload_flags(&current)) {
            if want && !have {
                if let Err(e) = sh("ifconfig", &[&snap.iface, flag]).await {
                    tracing::warn!(iface = %snap.iface, flag, ?e, "offload restore failed");
                    ok = false;
                }
            }
        }
        if !ok {
            pending.push(snap);
        }
    }

    tracing::info!(pending = pending.len(), "interface offloads restored");
    if let Err(e) = state::mutate(|s| s.offloads = pending).await {
        tracing::warn!(?e, "failed to record offload restore");
    }
}

pub async fn pfctl_remove() -> Result<()> {
    let flushed = sh("pfctl", &["-a", "com.apple.internet-sharing", "-F", "all"]).await;
    // Also clear the global state table so stale entries don't survive into
    // the next session.
    let _ = sh("pfctl", &["-F", "states"]).await;

    // Put the user's offload settings back so normal Wi-Fi throughput isn't
    // degraded after Unlocker is done.
    restore_offloads().await;

    // On failure the flag stays set so the next launch retries.
    flushed?;
    tokio::fs::remove_file(PF_RULES_PATH).await.ok();
    state::mutate(|s| s.pfctl_anchor_loaded = false).await?;
    tracing::info!("pfctl rules flushed");
    Ok(())
}

// ── DHCP leases ──────────────────────────────────────────────────────────────

pub async fn dhcpd_read() -> Result<Vec<DhcpLease>> {
    let path = "/var/db/dhcpd_leases";
    let body = match tokio::fs::read_to_string(path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    Ok(parse_dhcpd_leases(&body))
}

fn parse_dhcpd_leases(s: &str) -> Vec<DhcpLease> {
    // Apple's bootpd writes "key=value" lines inside { ... } blocks.
    let mut out = Vec::new();
    let mut cur: Option<(Option<String>, Option<String>, Option<String>)> = None;
    for line in s.lines() {
        let line = line.trim();
        if line == "{" {
            cur = Some((None, None, None));
        } else if line == "}" {
            if let Some((Some(ip), Some(mac), name)) = cur.take() {
                out.push(DhcpLease { ip, mac, name });
            } else {
                cur = None;
            }
        } else if let Some((ref mut ip, ref mut mac, ref mut name)) = cur {
            if let Some(v) = line.strip_prefix("ip_address=") {
                *ip = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("hw_address=") {
                // typical format: "1,aa:bb:cc:dd:ee:ff"
                let mac_only = v.trim().split(',').last().unwrap_or("").to_string();
                *mac = Some(mac_only);
            } else if let Some(v) = line.strip_prefix("name=") {
                *name = Some(v.trim().to_string());
            }
        }
    }
    out
}

// ── bridge IP discovery ──────────────────────────────────────────────────────

/// Address of the live Internet Sharing bridge, or an error while it
/// doesn't exist.
pub async fn bridge_ip() -> Result<String> {
    let wifi = wifi_device().await.ok();
    let blocks = parse_ifconfig(&sh("ifconfig", &["-a"]).await?);
    find_sharing_bridge(&blocks, wifi.as_deref())
        .map(|b| b.inet[0].clone())
        .ok_or_else(|| no_bridge_error(&blocks, wifi.as_deref()))
}

// ── full cleanup ─────────────────────────────────────────────────────────────

pub async fn full_cleanup() -> Result<()> {
    let s = state::read().await.unwrap_or_default();

    // pfctl rules are idempotent to remove; do it unconditionally so a missing
    // state file (force-quit, fresh install over a broken prior run) still
    // tears them down.
    let _ = pfctl_remove().await;

    // Only touch NAT_PLIST when we know we wrote one (state flag) or have a
    // backup to restore from. Without either signal, the plist might be the
    // user's own Internet Sharing config — leave it alone.
    if s.internet_sharing_active || Path::new(NAT_PLIST_BACKUP).exists() {
        let _ = is_disable().await;
    }

    // Always remove our adhoc upstream service and restore lo0. This is the
    // source of the lingering loopback bug: if the service is left in
    // System Settings → Network with lo0 as upstream, macOS networkd keeps
    // tearing down 127.0.0.1 every reboot. Run regardless of state.
    remove_adhoc_upstream().await;
    restore_loopback().await;

    // Each step above clears its own state flag only once it succeeds.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const IFCONFIG_ORBSTACK_ONLY: &str = "\
lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
\tinet 127.0.0.1 netmask 0xff000000
\tinet 10.10.10.1 netmask 0xffffffff
bridge0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
\tmember: en1 flags=3<LEARNING,DISCOVER>
\tmember: en2 flags=3<LEARNING,DISCOVER>
ap1: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
\tstatus: inactive
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
\tinet 10.0.1.34 netmask 0xfffffe00 broadcast 10.0.1.255
bridge100: flags=8a63<UP,BROADCAST,SMART,RUNNING,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
\toptions=63<RXCSUM,TXCSUM,TSO4,TSO6>
\tinet 192.168.139.3 netmask 0xfffffe00 broadcast 192.168.139.255
\tConfiguration:
\t\tid 0:0:0:0:0:0 priority 0 hellotime 0 fwddelay 0
\tmember: vmenet1 flags=10003<LEARNING,DISCOVER,CSUM>
";

    const IFCONFIG_SHARING_APPLE_SILICON: &str = "\
bridge100: flags=8a63<UP,BROADCAST,SMART,RUNNING,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
\tinet 192.168.139.3 netmask 0xfffffe00 broadcast 192.168.139.255
\tmember: vmenet1 flags=10003<LEARNING,DISCOVER,CSUM>
bridge104: flags=8a63<UP,BROADCAST,SMART,RUNNING,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
\tinet 192.168.2.1 netmask 0xffffff00 broadcast 192.168.2.255
\tmember: ap1 flags=3<LEARNING,DISCOVER>
";

    const IFCONFIG_SHARING_INTEL: &str = "\
bridge100: flags=8a63<UP,BROADCAST,SMART,RUNNING,ALLMULTI,SIMPLEX,MULTICAST> mtu 1500
\tinet 192.168.2.1 netmask 0xffffff00 broadcast 192.168.2.255
\tmember: en0 flags=3<LEARNING,DISCOVER>
";

    #[test]
    fn parses_ifconfig_blocks() {
        let blocks = parse_ifconfig(IFCONFIG_ORBSTACK_ONLY);
        let names: Vec<_> = blocks.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(names, ["lo0", "bridge0", "ap1", "en0", "bridge100"]);
        let b100 = blocks.iter().find(|b| b.name == "bridge100").unwrap();
        assert_eq!(b100.inet, ["192.168.139.3"]);
        assert_eq!(b100.members, ["vmenet1"]);
        let b0 = blocks.iter().find(|b| b.name == "bridge0").unwrap();
        assert!(b0.inet.is_empty());
        assert_eq!(b0.members, ["en1", "en2"]);
        assert_eq!(b100.options, ["RXCSUM", "TXCSUM", "TSO4", "TSO6"]);
    }

    #[test]
    fn vm_bridge_is_not_the_hotspot() {
        let blocks = parse_ifconfig(IFCONFIG_ORBSTACK_ONLY);
        assert!(find_sharing_bridge(&blocks, Some("en0")).is_none());
        assert!(find_sharing_bridge(&blocks, None).is_none());
    }

    #[test]
    fn finds_apple_silicon_sharing_bridge_next_to_vm_bridge() {
        let blocks = parse_ifconfig(IFCONFIG_SHARING_APPLE_SILICON);
        let b = find_sharing_bridge(&blocks, Some("en0")).unwrap();
        assert_eq!(b.name, "bridge104");
        assert_eq!(b.inet[0], "192.168.2.1");
        // Works even when the Wi-Fi name is unknown: `ap1` alone is enough.
        let b = find_sharing_bridge(&blocks, None).unwrap();
        assert_eq!(b.name, "bridge104");
    }

    #[test]
    fn finds_intel_sharing_bridge_by_wifi_member() {
        let blocks = parse_ifconfig(IFCONFIG_SHARING_INTEL);
        let b = find_sharing_bridge(&blocks, Some("en0")).unwrap();
        assert_eq!(b.name, "bridge100");
        assert!(find_sharing_bridge(&blocks, Some("en1")).is_none());
    }

    #[test]
    fn ap_iface_detection() {
        assert!(is_ap_iface("ap1"));
        assert!(is_ap_iface("ap0"));
        assert!(!is_ap_iface("ap"));
        assert!(!is_ap_iface("apple0"));
        assert!(!is_ap_iface("en0"));
    }

    #[test]
    fn scutil_values() {
        let out = "<dictionary> {\n  PrimaryInterface : en8\n  PrimaryService : 230E1C15-D667-4C6A-8C4B-8CCBD3236000\n  Router : 10.0.0.1\n}\n";
        assert_eq!(scutil_value(out, "PrimaryInterface").as_deref(), Some("en8"));
        assert_eq!(
            scutil_value(out, "PrimaryService").as_deref(),
            Some("230E1C15-D667-4C6A-8C4B-8CCBD3236000")
        );
        assert_eq!(scutil_value("No such key\n", "PrimaryInterface"), None);
        let svc = "<dictionary> {\n  UserDefinedName : USB 10/100/1000 LAN\n}\n";
        assert_eq!(
            scutil_value(svc, "UserDefinedName").as_deref(),
            Some("USB 10/100/1000 LAN")
        );
    }

    const SERVICE_ORDER: &str = "An asterisk (*) denotes that a network service is disabled.\n\
(*) Disabled Ethernet\n\
(Hardware Port: USB 10/100/1000 LAN, Device: en8)\n\
\n\
(1) Bridgething Superbird\n\
(Hardware Port: Bridgething Superbird, Device: en7)\n\
\n\
(2) USB 10/100/1000 LAN\n\
(Hardware Port: USB 10/100/1000 LAN, Device: en8)\n\
\n\
(3) Wi-Fi\n\
(Hardware Port: Wi-Fi, Device: en0)\n\
\n\
(4) Corporate VPN\n\
(Hardware Port: com.example.vpn, Device: utun4)\n";

    #[test]
    fn service_order_parse() {
        let services = parse_service_order(SERVICE_ORDER);
        assert_eq!(services.len(), 5);
        assert_eq!(
            services[0],
            NetService {
                name: "Disabled Ethernet".into(),
                device: "en8".into(),
                enabled: false,
            }
        );
        assert!(services[1..].iter().all(|s| s.enabled));
        assert_eq!(services[4].device, "utun4");
    }

    #[test]
    fn disabled_service_is_skipped() {
        let services = parse_service_order(SERVICE_ORDER);
        assert_eq!(
            enabled_service_for_device(&services, "en8"),
            Some("USB 10/100/1000 LAN")
        );
        assert_eq!(enabled_service_for_device(&services, "en9"), None);
    }

    #[test]
    fn vpn_primary_falls_back_to_active_ethernet() {
        let services = parse_service_order(SERVICE_ORDER);
        // en7 has a link-local address only; en8 is the real connection.
        let blocks = parse_ifconfig(
            "en7: flags=8863<UP> mtu 1500\n\
\tinet 169.254.10.2 netmask 0xffff0000\n\
en8: flags=8863<UP> mtu 1500\n\
\tinet 10.0.0.20 netmask 0xffffff00\n\
en0: flags=8863<UP> mtu 1500\n\
\tinet 10.0.1.34 netmask 0xffffff00\n\
utun4: flags=8051<UP> mtu 1380\n\
\tinet 172.16.0.5 --> 172.16.0.5 netmask 0xffffffff\n",
        );
        let picked = pick_active_service(&services, &blocks, "en0").unwrap();
        assert_eq!(picked.name, "USB 10/100/1000 LAN");
        assert_eq!(picked.device, "en8");
        assert!(pick_active_service(&services, &blocks[..1], "en0").is_none());
    }

    #[test]
    fn offload_snapshot_keeps_first_record() {
        let blocks = parse_ifconfig(
            "ap1: flags=8863<UP> mtu 1500\n\
\toptions=6460<TSO4,TSO6,CHANNEL_IO>\n",
        );
        let first = offload_snapshot(&blocks[0]);
        assert_eq!(
            first,
            OffloadSnapshot {
                iface: "ap1".into(),
                tso4: true,
                tso6: true,
                lro: false,
            }
        );
        let mut saved = vec![first.clone()];
        let disabled = OffloadSnapshot {
            tso4: false,
            tso6: false,
            ..first.clone()
        };
        merge_offloads(&mut saved, &[disabled]);
        assert_eq!(saved, [first]);
    }

    #[test]
    fn upstream_eligibility() {
        assert!(is_shareable_upstream("en8", "en0"));
        assert!(is_shareable_upstream("en7", "en0"));
        assert!(!is_shareable_upstream("en0", "en0"));
        assert!(!is_shareable_upstream("lo0", "en0"));
        assert!(!is_shareable_upstream("bridge100", "en0"));
        assert!(!is_shareable_upstream("vmenet1", "en0"));
        assert!(!is_shareable_upstream("utun3", "en0"));
        assert!(!is_shareable_upstream("ap1", "en0"));
        assert!(!is_shareable_upstream("", "en0"));
    }

    #[test]
    fn dhcpd_leases_parse() {
        let body = "{\n\tname=xteink\n\tip_address=192.168.2.5\n\thw_address=1,7c:e8:b1:ab:4c:88\n\tidentifier=1,7c:e8:b1:ab:4c:88\n}\n";
        let leases = parse_dhcpd_leases(body);
        assert_eq!(leases.len(), 1);
        assert_eq!(leases[0].ip, "192.168.2.5");
        assert_eq!(leases[0].mac, "7c:e8:b1:ab:4c:88");
        assert_eq!(leases[0].name.as_deref(), Some("xteink"));
    }
}
