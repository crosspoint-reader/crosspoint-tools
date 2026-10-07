//! Windows DNS interception sidecar for firmwares that hardcode a public
//! resolver.
//!
//! Background: the normal Windows path spoofs DNS via the `hosts` file, which
//! only works when the device uses the resolver ICS hands out over DHCP. X4 Pro
//! XTOS V7.6.10 (CN) ignores that and queries AliDNS `223.5.5.5` directly, so
//! ICS NAT forwards it upstream and our spoof never participates
//! (crosspoint-reader#3775). macOS/Linux don't have this problem because their
//! pf/iptables rule redirects *all* outbound UDP/53 regardless of destination;
//! Windows ICS exposes no equivalent, so we capture the forwarded query with
//! WinDivert and answer it ourselves.
//!
//! This runs *alongside* the hosts-file spoof, not instead of it: WinDivert's
//! FORWARD layer only sees packets ICS routes through the host (device -> public
//! resolver), while queries aimed at the ICS resolver stay local and are still
//! handled by hosts. Together they cover both behaviors.
//!
//! Why a separate process: linking WinDivert makes `WinDivert.dll` a hard
//! import, and a missing or AV-quarantined DLL stops such a binary from
//! starting at all. The privileged helper must always start, so the capture
//! loop lives here instead — if WinDivert is unavailable, broken, or the driver
//! refuses to load, only this sidecar fails and the helper carries on with
//! hosts-file spoofing. The helper spawns us when the user enables the Settings
//! toggle (opening the handle below is what installs and starts WinDivert's
//! kernel driver service) and stops us by killing the process; the kernel closes
//! the handle on exit.
//!
//! Usage: unlocker-divert.exe --bridge-ip <ipv4> --hosts <name>[,<name>...]
//!
//! Diagnostics go to stderr, which the helper reads line by line into its own
//! log. The packet parse/rewrite/checksum core lives in
//! `unlocker_core::dns_intercept` and is unit-tested cross-platform; building
//! this needs `WINDIVERT_PATH` pointing at the SDK libs (see `vendor/windivert/`).
//! Not yet exercised against a device that hardcodes a resolver — the capture
//! path is unverified on real traffic.

#[cfg(not(windows))]
fn main() {
    eprintln!("unlocker-divert is Windows-only");
    std::process::exit(1);
}

#[cfg(windows)]
fn main() {
    use std::net::Ipv4Addr;

    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .without_time()
        .init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut bridge_ip: Option<Ipv4Addr> = None;
    let mut hosts: Vec<String> = Vec::new();

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--bridge-ip" => {
                let Some(v) = args.get(i + 1) else {
                    fail("--bridge-ip needs a value");
                };
                match v.parse() {
                    Ok(ip) => bridge_ip = Some(ip),
                    Err(e) => fail(&format!("--bridge-ip '{v}' is not an IPv4 address: {e}")),
                }
                i += 2;
            }
            "--hosts" => {
                let Some(v) = args.get(i + 1) else {
                    fail("--hosts needs a value");
                };
                hosts = v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect();
                i += 2;
            }
            other => fail(&format!("unexpected argument '{other}'")),
        }
    }

    let Some(bridge_ip) = bridge_ip else {
        fail("missing --bridge-ip");
    };
    if hosts.is_empty() {
        fail("missing --hosts");
    }

    run(hosts, bridge_ip);
}

#[cfg(windows)]
fn fail(msg: &str) -> ! {
    eprintln!("unlocker-divert: {msg}");
    eprintln!("usage: unlocker-divert.exe --bridge-ip <ipv4> --hosts <name>[,<name>...]");
    std::process::exit(2);
}

/// Capture UDP/53 that the hotspot subnet sends to any resolver, and answer the
/// spoofed names locally. Non-spoofed queries are re-injected unchanged so real
/// DNS keeps working. `192.168.137.0/24` is the fixed Windows Mobile Hotspot
/// subnet; the filter also spares the bridge IP's own upstream lookups.
#[cfg(windows)]
const WINDIVERT_FILTER: &str =
    "udp.DstPort == 53 and ip.SrcAddr >= 192.168.137.1 and ip.SrcAddr <= 192.168.137.254";

#[cfg(windows)]
fn run(spoofed_hosts: Vec<String>, bridge_ip: std::net::Ipv4Addr) {
    use std::borrow::Cow;
    use unlocker_core::dns_intercept::spoof_forwarded_dns;
    use windivert::layer;
    use windivert::prelude::*;

    // Opening the forward-layer handle is what installs + starts the WinDivert
    // kernel driver service. Failing here is normal and expected when the
    // driver can't load; exit non-zero and let the helper log it and move on
    // with hosts-file spoofing only.
    let handle =
        match WinDivert::<layer::ForwardLayer>::forward(WINDIVERT_FILTER, 0, WinDivertFlags::new())
        {
            Ok(h) => h,
            Err(e) => {
                tracing::error!(error = %e,
                    "WinDivert unavailable (driver missing or blocked); devices that hardcode \
                     a public resolver (e.g. X4 Pro XTOS V7.6.10) will not be captured");
                std::process::exit(3);
            }
        };

    tracing::info!(%bridge_ip, hosts = spoofed_hosts.len(), "WinDivert DNS interceptor armed");

    // No stop flag: the helper stops us by killing the process, which closes
    // the handle. recv() blocks until a matching packet arrives, so there is
    // nothing to poll and nothing that can hang a teardown.
    let mut buf = vec![0u8; 65535];
    loop {
        let packet = match handle.recv(Some(&mut buf)) {
            Ok(p) => p,
            Err(e) => {
                tracing::debug!(error = %e, "WinDivert recv error");
                continue;
            }
        };

        match spoof_forwarded_dns(&packet.data, &spoofed_hosts, bridge_ip) {
            Some(reply) => {
                // Ours: inject the crafted reply back toward the device and drop
                // the original query (don't forward it upstream). windivert 0.6
                // has no address->packet helper, so build the packet from its
                // public fields: reuse the received forward-layer address (same
                // interface — the device is directly connected on the hotspot
                // subnet) with our owned payload. Checksums are already correct
                // (built in dns_intercept), so no recalc is needed.
                let out = WinDivertPacket::<layer::ForwardLayer> {
                    address: packet.address.clone(),
                    data: Cow::Owned(reply),
                };
                if let Err(e) = handle.send(&out) {
                    tracing::debug!(error = %e, "WinDivert send (spoofed reply) failed");
                }
            }
            None => {
                // Not a spoofed name (or not a DNS query): forward unchanged so
                // normal internet resolution keeps working.
                if let Err(e) = handle.send(&packet) {
                    tracing::debug!(error = %e, "WinDivert send (pass-through) failed");
                }
            }
        }
    }
}
