//! Supervises the `unlocker-divert` sidecar, which intercepts DNS that a device
//! sends straight to a hardcoded public resolver (see that crate's docs for the
//! why and the packet details).
//!
//! Nothing here links WinDivert on purpose: `WinDivert.dll` is a plain import,
//! so a binary that links it won't start when the DLL is missing or
//! AV-quarantined. The helper must always start, so the capture loop lives in a
//! separate process and every WinDivert failure mode — absent DLL, corrupt DLL,
//! driver refusing to load, sidecar crash — degrades to "the sidecar isn't
//! running" and leaves hosts-file spoofing in place.

#![cfg(windows)]

use std::io::{BufRead, BufReader};
use std::net::Ipv4Addr;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

// kernel32 is always linked on Windows. A process whose DLL import is missing
// or corrupt makes the loader show a modal "WinDivert.dll was not found" hard
// error and wait for someone to click OK — the sidecar would hang there
// instead of exiting. Child processes inherit the error mode, so setting
// SEM_FAILCRITICALERRORS before spawning turns that into a silent non-zero
// exit. This helper runs unattended with admin rights and must never put UI on
// screen, so suppressing critical-error dialogs process-wide is what we want.
const SEM_FAILCRITICALERRORS: u32 = 0x0001;
extern "system" {
    fn SetErrorMode(mode: u32) -> u32;
}

/// Dev override, mirroring `UNLOCKER_HELPER_PATH` in the app: point at a
/// freshly built `target\release\unlocker-divert.exe` when running a helper
/// that isn't installed next to its sidecar.
const PATH_OVERRIDE_VAR: &str = "UNLOCKER_DIVERT_PATH";

pub struct DnsInterceptor {
    child: Arc<Mutex<Child>>,
}

/// Spawn the interceptor. Returns `None` (fail-soft) if the sidecar is missing
/// or won't start, so the caller keeps hosts-file-only spoofing.
pub fn start(spoofed_hosts: Vec<String>, bridge_ip: Ipv4Addr) -> Option<DnsInterceptor> {
    if spoofed_hosts.is_empty() {
        return None;
    }

    let exe = sidecar_path()?;

    // The sidecar imports WinDivert.dll, which the installer ships next to it.
    // Check first: if an AV has quarantined it, spawning would only produce a
    // process that dies in the loader, and the log line below is far more
    // useful than a bare 0xC0000135 exit code.
    let dll = exe.with_file_name("WinDivert.dll");
    if !dll.is_file() {
        tracing::warn!(path = %dll.display(),
            "WinDivert.dll missing (removed or quarantined?); DNS interception unavailable, \
             falling back to hosts-file spoof only");
        return None;
    }
    let driver = exe.with_file_name("WinDivert64.sys");
    if !driver.is_file() {
        tracing::warn!(path = %driver.display(),
            "WinDivert64.sys missing; the sidecar will start but the driver won't load");
    }

    // Children inherit this, so a corrupt DLL fails silently instead of
    // parking on a modal loader dialog.
    unsafe {
        let prev = SetErrorMode(0);
        SetErrorMode(prev | SEM_FAILCRITICALERRORS);
    }

    let mut child = match Command::new(&exe)
        .arg("--bridge-ip")
        .arg(bridge_ip.to_string())
        .arg("--hosts")
        .arg(spoofed_hosts.join(","))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, path = %exe.display(),
                "DNS interceptor sidecar failed to start; falling back to hosts-file spoof only");
            return None;
        }
    };

    let pid = child.id();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));

    // Forward the sidecar's diagnostics into our own log. It exits non-zero
    // when WinDivert can't open, and that line is the only clue the user gets,
    // so it must not be swallowed. Once the pipe closes the sidecar is gone:
    // report how it went, which is also how a death inside the loader (no
    // output at all) becomes visible.
    if let Some(stderr) = stderr {
        let child = child.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                tracing::info!(target: "unlocker_divert", "{line}");
            }
            if let Ok(mut c) = child.lock() {
                match c.try_wait() {
                    Ok(Some(status)) => tracing::warn!(pid, ?status,
                        "DNS interceptor sidecar exited; hosts-file spoof continues"),
                    // Still running with its stderr closed, or already reaped
                    // by stop() — neither is worth a line.
                    Ok(None) | Err(_) => {}
                }
            }
        });
    }

    tracing::info!(pid, %bridge_ip, "DNS interceptor sidecar spawned");
    Some(DnsInterceptor { child })
}

impl DnsInterceptor {
    pub fn stop(self) {
        // Kill rather than signal: the sidecar parks in a blocking recv() and
        // Windows has no cheap way to interrupt it. Process exit closes the
        // WinDivert handle, so teardown can't hang on a quiet hotspot.
        let Ok(mut child) = self.child.lock() else {
            tracing::warn!("DNS interceptor state poisoned; leaving sidecar to exit on its own");
            return;
        };
        let pid = child.id();
        match child.kill() {
            // kill() on an already-exited child is Ok, so this covers the
            // sidecar having died on its own (e.g. driver refused to load).
            Ok(()) => {
                let _ = child.wait();
                tracing::info!(pid, "DNS interceptor sidecar stopped");
            }
            Err(e) => tracing::warn!(pid, error = %e, "could not stop DNS interceptor sidecar"),
        }
    }
}

/// The installer ships `unlocker-divert.exe` next to `unlocker-helper.exe`, so
/// resolve it relative to our own binary.
fn sidecar_path() -> Option<std::path::PathBuf> {
    if let Some(p) = std::env::var_os(PATH_OVERRIDE_VAR) {
        let p = std::path::PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
        tracing::warn!(path = %p.display(), "{PATH_OVERRIDE_VAR} set but not a file; ignoring");
    }

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "can't resolve helper path; DNS interception unavailable");
            return None;
        }
    };
    let sidecar = exe.with_file_name("unlocker-divert.exe");
    if sidecar.is_file() {
        return Some(sidecar);
    }
    tracing::warn!(path = %sidecar.display(),
        "DNS interceptor sidecar not found; falling back to hosts-file spoof only");
    None
}
