//! Minimal SNTP responder.
//!
//! Stock firmwares (notably the Xteink X4 Pro / app1) sync their clock over NTP
//! *before* contacting the update API. On the unlocker's isolated hotspot there
//! is no real internet upstream, so those NTP requests never get an answer and
//! the device spins forever resolving `pool.ntp.org` / `time.google.com`,
//! without ever reaching `check-update`. We answer NTP ourselves with the host
//! machine's current time so the device sets its clock and moves on.
//!
//! This is deliberately a bare SNTP server: stratum-1, no delay/dispersion
//! bookkeeping. The device only needs a roughly-correct wall clock (enough to
//! pass freshness / TLS-validity checks); the host clock is authoritative and
//! close enough. The matching DNS spoof (see `dns.rs`) points the NTP
//! hostnames at the bridge IP so these requests land here.

use anyhow::Result;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;

/// Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01).
const NTP_UNIX_OFFSET: u64 = 2_208_988_800;

pub struct NtpHandle {
    shutdown: tokio::sync::oneshot::Sender<()>,
    pub join: tokio::task::JoinHandle<()>,
}

impl NtpHandle {
    pub async fn shutdown(self) {
        let _ = self.shutdown.send(());
        let _ = self.join.await;
    }
}

/// Current time as an NTP (seconds, fraction) pair — 32.32 fixed point since
/// the NTP epoch.
fn now_ntp() -> (u32, u32) {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = (d.as_secs() + NTP_UNIX_OFFSET) as u32;
    let frac = (((d.subsec_nanos() as u64) << 32) / 1_000_000_000) as u32;
    (secs, frac)
}

/// Build a 48-byte SNTP server reply for a client request.
fn build_response(request: &[u8]) -> [u8; 48] {
    let mut r = [0u8; 48];
    // LI = 0 (no leap warning), VN = 4, Mode = 4 (server).
    r[0] = (4 << 3) | 4;
    r[1] = 1; // stratum 1 (primary reference)
    r[2] = request.get(2).copied().unwrap_or(4); // echo the client's poll interval
    r[3] = 0xEC; // precision ≈ 2^-20 s (~1 µs)
    // Bytes 4..12 (root delay + root dispersion) stay zero.
    r[12..16].copy_from_slice(b"LOCL"); // reference identifier

    let (secs, frac) = now_ntp();
    let write_ts = |buf: &mut [u8]| {
        buf[0..4].copy_from_slice(&secs.to_be_bytes());
        buf[4..8].copy_from_slice(&frac.to_be_bytes());
    };
    write_ts(&mut r[16..24]); // reference timestamp
    // Originate timestamp echoes the client's transmit timestamp (bytes 40..48)
    // so the device can match request/response.
    if request.len() >= 48 {
        r[24..32].copy_from_slice(&request[40..48]);
    }
    write_ts(&mut r[32..40]); // receive timestamp
    write_ts(&mut r[40..48]); // transmit timestamp
    r
}

/// Bind an SNTP responder on `bind_ip:port` (usually the bridge IP, port 123).
/// The helper runs as root, so binding the privileged port is fine.
pub async fn start(bind_ip: IpAddr, port: u16) -> Result<NtpHandle> {
    let addr = SocketAddr::new(bind_ip, port);
    let socket = Arc::new(UdpSocket::bind(addr).await?);
    tracing::info!(?addr, "NTP responder bound");

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    let join = tokio::spawn(async move {
        let mut buf = vec![0u8; 128];
        loop {
            tokio::select! {
                _ = &mut rx => break,
                res = socket.recv_from(&mut buf) => match res {
                    Ok((n, src)) => {
                        let reply = build_response(&buf[..n]);
                        match socket.send_to(&reply, src).await {
                            Ok(_) => tracing::info!(%src, "answered NTP time sync"),
                            Err(e) => tracing::debug!(?e, "ntp send error"),
                        }
                    }
                    Err(e) => tracing::warn!(?e, "ntp recv error"),
                },
            }
        }
    });

    Ok(NtpHandle { shutdown: tx, join })
}
