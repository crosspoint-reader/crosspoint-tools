//! Windows DNS interception for firmwares that hardcode a public resolver.
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
//! Fail-soft: WinDivert needs its signed driver (`WinDivert64.sys`) present. If
//! it can't open, we log and return `None` — the caller keeps the hosts-file
//! path, matching today's behavior for resolver-respecting devices.
//!
//! !!! UNTESTED ON WINDOWS !!! The packet parse/rewrite/checksum core lives in
//! `unlocker_core::dns_intercept` and is unit-tested cross-platform. The lines
//! below marked `VERIFY:` are the WinDivert-crate glue that must be checked
//! against the installed crate version during a Windows build.

#![cfg(windows)]

use anyhow::Result;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use unlocker_core::dns_intercept::spoof_forwarded_dns;
use windivert::prelude::*;

/// Capture UDP/53 that the hotspot subnet sends to any resolver, and answer the
/// spoofed names locally. Non-spoofed queries are re-injected unchanged so real
/// DNS keeps working. `192.168.137.0/24` is the fixed Windows Mobile Hotspot
/// subnet; the filter also spares the bridge IP's own upstream lookups.
const WINDIVERT_FILTER: &str =
    "udp.DstPort == 53 and ip.SrcAddr >= 192.168.137.1 and ip.SrcAddr <= 192.168.137.254";

pub struct DnsInterceptor {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

/// Start the interceptor. Returns `None` (fail-soft) if WinDivert can't open,
/// so the caller falls back to hosts-file-only spoofing.
pub fn start(spoofed_hosts: Vec<String>, bridge_ip: Ipv4Addr) -> Option<DnsInterceptor> {
    // VERIFY: forward-layer handle constructor + flags for the crate version.
    let handle = match WinDivert::<layer::ForwardLayer>::forward(
        WINDIVERT_FILTER,
        0,
        WinDivertFlags::new(),
    ) {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!(error = %e,
                "WinDivert DNS interceptor unavailable (driver missing?); \
                 falling back to hosts-file spoof only. Devices that hardcode a \
                 public resolver (e.g. X4 Pro XTOS V7.6.10) will not be captured.");
            return None;
        }
    };

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let thread = std::thread::spawn(move || {
        run_loop(handle, &stop_thread, &spoofed_hosts, bridge_ip);
    });
    tracing::info!(%bridge_ip, "WinDivert DNS interceptor armed");
    Some(DnsInterceptor { stop, thread: Some(thread) })
}

impl DnsInterceptor {
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // recv() blocks; the thread rechecks `stop` after each packet. A quiet
        // hotspot may leave it parked in recv until the next stray packet — for
        // a clean, immediate unblock, VERIFY the crate's shutdown/close call and
        // invoke it here (e.g. handle.shutdown(WinDivertShutdownMode::Both)).
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn run_loop(
    handle: WinDivert<layer::ForwardLayer>,
    stop: &AtomicBool,
    spoofed_hosts: &[String],
    bridge_ip: Ipv4Addr,
) {
    let mut buf = vec![0u8; 65535];
    while !stop.load(Ordering::SeqCst) {
        // VERIFY: recv signature/return shape (packet.data: Cow<[u8]>, packet.address).
        let packet = match handle.recv(Some(&mut buf)) {
            Ok(p) => p,
            Err(e) => {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                tracing::debug!(error = %e, "WinDivert recv error");
                continue;
            }
        };

        match spoof_forwarded_dns(&packet.data, spoofed_hosts, bridge_ip) {
            Some(reply) => {
                // Ours: inject the crafted reply back toward the device and drop
                // the original query (don't forward it upstream).
                // VERIFY: constructing an injectable packet + its address. The
                // reply is resolver->device; reuse the received address (same
                // interface) since the device is directly connected on the
                // hotspot subnet. Checksums are already correct (built in
                // dns_intercept), so no recalc is needed.
                let mut out = packet.address.clone().into_packet(reply);
                if let Err(e) = handle.send(&out) {
                    tracing::debug!(error = %e, "WinDivert send (spoofed reply) failed");
                }
                let _ = &mut out;
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
    tracing::info!("WinDivert DNS interceptor stopped");
}
