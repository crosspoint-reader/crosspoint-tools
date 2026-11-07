//! Windows privileged ops.
//!
//! Hotspot bring-up/teardown drives the WinRT `NetworkOperatorTetheringManager`
//! via an embedded PowerShell snippet — far less Rust glue than binding the
//! WinRT projections directly, and well-trodden territory for "start Mobile
//! Hotspot from a script". Windows handles NAT + DHCP itself; the host always
//! ends up at 192.168.137.1.
//!
//! Device discovery scans the system ARP table (`arp -a`) under the hotspot's
//! interface heading.

use crate::proto::DhcpLease;
use crate::state;
use anyhow::{anyhow, bail, Context, Result};
use tokio::process::Command;
use unlocker_core::types::HotspotSetup;

async fn run_powershell(script: &str) -> Result<String> {
    let out = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .await
        .context("spawning powershell.exe")?;
    if !out.status.success() {
        bail!(
            "powershell failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ── Mobile Hotspot ───────────────────────────────────────────────────────────

/// PowerShell helper that resolves the WinRT IAsyncOperation pattern by
/// finding the right AsTask overload and waiting on it synchronously.
const AWAIT_HELPER: &str = r#"
function Await($WinRtTask, $ResultType) {
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
"#;

pub async fn is_enable(ssid: &str, psk: &str) -> Result<HotspotSetup> {
    if ssid.is_empty() {
        bail!("ssid empty");
    }
    if psk.len() < 8 {
        bail!("psk must be ≥ 8 chars (Windows hotspot rule)");
    }

    // Pass SSID/PSK via env so we don't have to escape into the PowerShell
    // string. PowerShell reads them from $env:.
    let script = format!(
        r#"
{await_helper}

[void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]

$profile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
if ($null -eq $profile) {{ throw 'no active internet connection profile — Windows Mobile Hotspot needs an upstream to share' }}

$mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($profile)
$cfg = $mgr.GetCurrentAccessPointConfiguration()
$cfg.Ssid = $env:UNLOCKER_SSID
$cfg.Passphrase = $env:UNLOCKER_PSK
# Force 2.4 GHz: the Xteink (ESP32) is 2.4 GHz only. Auto-band can pick 5 GHz
# on dual-band adapters and the device then can't see the SSID.
$band24 = [Windows.Networking.NetworkOperators.TetheringWiFiBand]::TwoPointFourGigahertz
if ($cfg.IsBandSupported($band24)) {{ $cfg.Band = $band24 }}
$null = Await ($mgr.ConfigureAccessPointAsync($cfg)) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])

if ($mgr.TetheringOperationalState -ne 'On') {{
    $null = Await ($mgr.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
}}
Write-Output 'ok'
"#,
        await_helper = AWAIT_HELPER
    );

    state::mutate(|s| s.internet_sharing_active = true).await?;

    let out = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .env("UNLOCKER_SSID", ssid)
        .env("UNLOCKER_PSK", psk)
        .output()
        .await
        .context("spawning powershell.exe")?;
    if !out.status.success() {
        bail!(
            "tether start failed ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    tracing::info!(%ssid, "Mobile Hotspot configured and started");
    Ok(HotspotSetup::default())
}

pub async fn is_disable() -> Result<()> {
    let script = format!(
        r#"
{await_helper}

[void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]

$profile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
if ($null -ne $profile) {{
    $mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($profile)
    if ($mgr.TetheringOperationalState -eq 'On') {{
        $null = Await ($mgr.StopTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    }}
}}
Write-Output 'ok'
"#,
        await_helper = AWAIT_HELPER
    );

    let _ = run_powershell(&script).await;
    state::mutate(|s| s.internet_sharing_active = false).await?;
    tracing::info!("Mobile Hotspot stopped");
    Ok(())
}

// ── Port redirection (no-op on Windows) ──────────────────────────────────────

// On macOS, Internet Sharing owns port 53 and we have to rdr around it. On
// Windows, the helper binds the spoofing servers directly to 192.168.137.1
// on the privileged ports — no firewall rewriting needed. We keep the RPC
// methods so the cross-platform protocol stays identical.

pub async fn pfctl_add(_from_port: u16, _to_port: u16) -> Result<()> {
    Ok(())
}

pub async fn pfctl_remove() -> Result<()> {
    Ok(())
}

// ── Hosts file (DNS spoofing on Windows) ─────────────────────────────────────
//
// Windows Mobile Hotspot is backed by Internet Connection Sharing, which owns
// UDP port 53 on the gateway IP and runs its own DNS proxy (in svchost). That
// proxy forwards lookups via the host's name resolver — so binding our own DNS
// to 192.168.137.1:53 is impossible without disabling ICS (which would also
// kill the hotspot's DHCP and NAT). Instead we redirect via the system hosts
// file: the ICS proxy's resolver checks hosts first, so adding our spoofed
// names there makes it return 192.168.137.1 for the device's queries.

const HOSTS_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
const HOSTS_TMP_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts.xteink.tmp";
const HOSTS_BEGIN: &str = "# BEGIN xteink-unlocker";
const HOSTS_END: &str = "# END xteink-unlocker";

/// Replace the system hosts file by writing a sibling tempfile and renaming
/// over it. Defender / dnscache frequently hold a read-share on `hosts`,
/// causing direct writes to fail with `ERROR_SHARING_VIOLATION` (32) or
/// `ERROR_LOCK_VIOLATION` (33). Atomic replace via `MoveFileExW` succeeds
/// against most of these locks; we retry the rename on the rest.
async fn replace_hosts_file(content: &str) -> Result<()> {
    tokio::fs::write(HOSTS_TMP_PATH, content)
        .await
        .with_context(|| format!("writing temp hosts file at {HOSTS_TMP_PATH}"))?;

    let mut last_err: Option<std::io::Error> = None;
    for attempt in 0..10 {
        match tokio::fs::rename(HOSTS_TMP_PATH, HOSTS_PATH).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                let code = e.raw_os_error();
                let retryable = matches!(code, Some(32) | Some(33));
                if !retryable {
                    let _ = tokio::fs::remove_file(HOSTS_TMP_PATH).await;
                    return Err(anyhow!(e)).context("renaming temp hosts file into place");
                }
                tracing::warn!(?code, attempt, "hosts file locked, retrying");
                last_err = Some(e);
                tokio::time::sleep(std::time::Duration::from_millis(150 * (attempt + 1))).await;
            }
        }
    }
    let _ = tokio::fs::remove_file(HOSTS_TMP_PATH).await;
    Err(anyhow!(last_err.unwrap())).context("hosts file remained locked after retries")
}

pub async fn hosts_arm(hosts: &[String], ip: std::net::Ipv4Addr) -> Result<()> {
    // Idempotent: strip any prior block before appending a fresh one.
    hosts_disarm().await?;

    let mut block = String::new();
    block.push_str(HOSTS_BEGIN);
    block.push('\n');
    for host in hosts {
        block.push_str(&format!("{ip} {host}\n"));
    }
    block.push_str(HOSTS_END);
    block.push('\n');

    let mut existing = tokio::fs::read_to_string(HOSTS_PATH)
        .await
        .unwrap_or_default();
    if !existing.is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    existing.push_str(&block);
    replace_hosts_file(&existing)
        .await
        .context("writing hosts file")?;
    state::mutate(|s| s.hosts_modified = true).await?;

    // Flush the resolver cache so the ICS DNS proxy doesn't keep returning
    // its prior cached upstream answer for our spoofed names.
    let _ = run_powershell("ipconfig /flushdns | Out-Null").await;

    tracing::info!(?hosts, %ip, "hosts file: spoof block written");
    Ok(())
}

pub async fn hosts_disarm() -> Result<()> {
    let Ok(content) = tokio::fs::read_to_string(HOSTS_PATH).await else {
        state::mutate(|s| s.hosts_modified = false).await?;
        return Ok(());
    };
    if !content.contains(HOSTS_BEGIN) {
        state::mutate(|s| s.hosts_modified = false).await?;
        return Ok(());
    }

    let mut keep = Vec::new();
    let mut in_block = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == HOSTS_BEGIN {
            in_block = true;
            continue;
        }
        if trimmed == HOSTS_END {
            in_block = false;
            continue;
        }
        if !in_block {
            keep.push(line);
        }
    }
    let mut out = keep.join("\n");
    if !out.ends_with('\n') {
        out.push('\n');
    }
    replace_hosts_file(&out)
        .await
        .context("writing hosts file")?;
    state::mutate(|s| s.hosts_modified = false).await?;

    let _ = run_powershell("ipconfig /flushdns | Out-Null").await;

    tracing::info!("hosts file: spoof block removed");
    Ok(())
}

// ── Bridge IP ────────────────────────────────────────────────────────────────

pub async fn bridge_ip() -> Result<String> {
    // Windows Mobile Hotspot always uses 192.168.137.1. Filter on
    // AddressState='Preferred' so we don't return while DAD is still running —
    // a Tentative address shows up in Get-NetIPAddress but bind() against it
    // fails with WSAEADDRNOTAVAIL (10049).
    let script = r#"
$adapter = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '192.168.137.*' -and $_.AddressState -eq 'Preferred' } |
    Select-Object -First 1
if ($adapter) { Write-Output $adapter.IPAddress } else { Write-Output 'none' }
"#;
    let out = run_powershell(script).await?;
    let ip = out.trim();
    if ip == "none" || ip.is_empty() {
        return Err(anyhow!(
            "hotspot adapter not yet present (192.168.137.0/24)"
        ));
    }
    Ok(ip.to_string())
}

// ── DHCP leases (via ARP table) ──────────────────────────────────────────────

pub async fn dhcpd_read() -> Result<Vec<DhcpLease>> {
    let bridge = bridge_ip().await.ok();
    let out = Command::new("arp").arg("-a").output().await?;
    if !out.status.success() {
        return Ok(vec![]);
    }
    let body = String::from_utf8_lossy(&out.stdout);
    Ok(parse_arp_output(&body, bridge.as_deref()))
}

/// Returns "A.B.C." for an IP "A.B.C.D", or None for a malformed input.
fn subnet_prefix(ip: &str) -> Option<String> {
    let octets: Vec<&str> = ip.split('.').collect();
    if octets.len() != 4 {
        return None;
    }
    Some(format!("{}.{}.{}.", octets[0], octets[1], octets[2]))
}

fn parse_arp_output(s: &str, bridge_ip: Option<&str>) -> Vec<DhcpLease> {
    // arp -a output (Windows Mobile Hotspot example):
    //   Interface: 192.168.137.1 --- 0xN
    //     Internet Address      Physical Address      Type
    //     192.168.137.28        38-44-be-98-3e-2c     static
    //     192.168.137.255       ff-ff-ff-ff-ff-ff     static
    //     224.0.0.22            01-00-5e-00-00-16     static
    //
    // Windows ICS pre-populates DHCP-bound clients as `static` (NOT `dynamic`)
    // in the host's ARP table. Filter on the bridge subnet and well-known
    // multicast/broadcast MAC prefixes instead of trusting the kind column.
    let Some(bridge) = bridge_ip else {
        return Vec::new();
    };
    let Some(prefix) = subnet_prefix(bridge) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    let mut in_section = false;
    for line in s.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Interface:") {
            // Match the section header for the bridge interface only —
            // ignores Ethernet, VPN, etc. on the same machine.
            in_section = trimmed.contains(bridge);
            continue;
        }
        if !in_section {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let (Some(ip), Some(mac), Some(_kind)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        if !ip.starts_with(&prefix) || ip == bridge || ip.ends_with(".255") {
            continue;
        }
        let mac_lower = mac.to_lowercase();
        // Multicast OUI (01:00:5e:*) or all-FF broadcast.
        if mac_lower.starts_with("01-00-5e") || mac_lower == "ff-ff-ff-ff-ff-ff" {
            continue;
        }
        // Normalize MAC from aa-bb-cc-dd-ee-ff to aa:bb:cc:dd:ee:ff for parity
        // with macOS dhcpd output, so consumers can match either.
        let mac_norm = mac.replace('-', ":").to_lowercase();
        out.push(DhcpLease {
            ip: ip.to_string(),
            mac: mac_norm,
            name: None,
        });
    }
    out
}

// ── Full cleanup ─────────────────────────────────────────────────────────────

pub async fn full_cleanup() -> Result<()> {
    let s = state::read().await.unwrap_or_default();
    if s.internet_sharing_active {
        let _ = is_disable().await;
    }
    if s.hosts_modified {
        let _ = hosts_disarm().await;
    }
    state::mutate(|s| {
        s.internet_sharing_active = false;
        s.pfctl_anchor_loaded = false;
        s.hosts_modified = false;
    })
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_arp_output() {
        // Real Windows Mobile Hotspot output: connected DHCP clients show as
        // `static`, alongside broadcast/multicast which we still must skip.
        let sample = r#"
Interface: 192.168.137.1 --- 0xa
  Internet Address      Physical Address      Type
  192.168.137.28        38-44-be-98-3e-2c     static
  192.168.137.255       ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static

Interface: 10.0.0.5 --- 0xb
  Internet Address      Physical Address      Type
  10.0.0.1              11-22-33-44-55-66     dynamic
"#;
        let leases = parse_arp_output(sample, Some("192.168.137.1"));
        assert_eq!(leases.len(), 1);
        assert_eq!(leases[0].ip, "192.168.137.28");
        assert_eq!(leases[0].mac, "38:44:be:98:3e:2c");
    }

    #[test]
    fn parse_arp_returns_empty_when_bridge_unknown() {
        let leases = parse_arp_output(
            "Interface: 192.168.137.1\n  192.168.137.5 aa-bb static\n",
            None,
        );
        assert!(leases.is_empty());
    }

    #[test]
    fn parse_arp_works_for_non_default_bridge_subnet() {
        // Hypothetical: if Windows ever changes the Mobile Hotspot default
        // subnet, the parser should follow the live bridge IP.
        let sample = r#"
Interface: 10.0.0.1 --- 0xa
  Internet Address      Physical Address      Type
  10.0.0.42             38-44-be-98-3e-2c     static
  10.0.0.255            ff-ff-ff-ff-ff-ff     static
"#;
        let leases = parse_arp_output(sample, Some("10.0.0.1"));
        assert_eq!(leases.len(), 1);
        assert_eq!(leases[0].ip, "10.0.0.42");
    }
}
