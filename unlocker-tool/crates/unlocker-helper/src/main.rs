//! Privileged helper for Xteink Unlocker.
//!
//! Runs elevated and exposes a tiny JSON-RPC protocol over a platform-native
//! transport (Unix domain socket on macOS, named pipe on Windows). Owns:
//!   * Network state (Internet Sharing / Mobile Hotspot, NAT, lease watching).
//!   * The spoofing servers (DNS / HTTP / HTTPS) bound to privileged ports.
//!
//! The unprivileged main process drives us via RPC; we never run untrusted
//! code from the main.

mod ops;
mod proto;
mod servers;
mod state;

use proto::{Request, Response};
use servers::ServerHolder;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use unlocker_core::transport::{self, Listener, Stream};

fn log_path() -> std::path::PathBuf {
    #[cfg(unix)]
    {
        std::path::PathBuf::from("/tmp/unlocker-helper.log")
    }
    #[cfg(windows)]
    {
        let base = std::env::var_os("ProgramData")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\ProgramData"));
        let dir = base.join("CrossPoint").join("unlocker-helper");
        let _ = std::fs::create_dir_all(&dir);
        dir.join("unlocker-helper.log")
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let log_file = std::fs::File::create(log_path()).expect("cannot create helper log file");
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::sync::Mutex::new(log_file))
        .init();

    let endpoint = transport::endpoint();
    let listener = Listener::bind(&endpoint)?;
    tracing::info!(version = env!("CARGO_PKG_VERSION"), %endpoint, "helper listening");

    if let Err(e) = state::recover().await {
        tracing::warn!(?e, "state recovery had issues");
    }

    let servers = ServerHolder::new();

    // ── Signal handlers (Unix only) ───────────────────────────────────────────
    // SIGTERM is the standard "please stop cleanly" signal sent by the parent
    // app, systemd, launchd, etc.  SIGINT covers Ctrl-C during development.
    // SIGKILL (-9) cannot be caught; the state file + recover() covers that.
    #[cfg(unix)]
    let mut sigterm = {
        use tokio::signal::unix::{signal, SignalKind};
        signal(SignalKind::terminate()).expect("SIGTERM handler")
    };
    #[cfg(unix)]
    let mut sigint = {
        use tokio::signal::unix::{signal, SignalKind};
        signal(SignalKind::interrupt()).expect("SIGINT handler")
    };

    loop {
        #[cfg(unix)]
        tokio::select! {
            // ── New client connection ─────────────────────────────────────────
            result = listener.accept() => {
                let stream = result?;
                let s = servers.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle(stream, s).await {
                        tracing::warn!(?e, "client disconnected");
                    }
                });
            }

            // ── Graceful shutdown on SIGTERM ──────────────────────────────────
            _ = sigterm.recv() => {
                tracing::info!("received SIGTERM - running cleanup and exiting");
                servers.disarm().await.ok();
                if let Err(e) = ops::full_cleanup().await {
                    tracing::warn!(?e, "cleanup on SIGTERM had errors");
                }
                break;
            }

            // ── Graceful shutdown on SIGINT (Ctrl-C / dev runs) ───────────────
            _ = sigint.recv() => {
                tracing::info!("received SIGINT - running cleanup and exiting");
                servers.disarm().await.ok();
                if let Err(e) = ops::full_cleanup().await {
                    tracing::warn!(?e, "cleanup on SIGINT had errors");
                }
                break;
            }
        }

        // On non-Unix targets there are no Unix signals; just accept forever.
        #[cfg(not(unix))]
        {
            let stream = listener.accept().await?;
            let s = servers.clone();
            tokio::spawn(async move {
                if let Err(e) = handle(stream, s).await {
                    tracing::warn!(?e, "client disconnected");
                }
            });
        }
    }

    tracing::info!("helper exiting cleanly");
    Ok(())
}

async fn handle(stream: Stream, servers: Arc<ServerHolder>) -> anyhow::Result<()> {
    let (r, mut w) = tokio::io::split(stream);
    let mut lines = BufReader::new(r).lines();
    while let Some(line) = lines.next_line().await? {
        let resp = match serde_json::from_str::<Request>(&line) {
            Ok(req) => dispatch(req, &servers).await,
            Err(e) => Response::Err {
                error: format!("bad request: {e}"),
            },
        };
        let mut bytes = serde_json::to_vec(&resp)?;
        bytes.push(b'\n');
        w.write_all(&bytes).await?;
        w.flush().await?;
    }
    Ok(())
}

async fn dispatch(req: Request, servers: &ServerHolder) -> Response {
    let result: anyhow::Result<serde_json::Value> = match req {
        Request::Ping => Ok(serde_json::json!({
            "pong": true,
            "version": env!("CARGO_PKG_VERSION"),
        })),

        Request::IsEnable { ssid, psk } => ops::is_enable(&ssid, &psk).await.map(|setup| {
            let mut v = serde_json::json!(setup);
            v["ssid"] = ssid.into();
            v
        }),
        Request::IsDisable => ops::is_disable().await.map(|_| serde_json::json!({})),
        Request::PfctlAdd { from_port, to_port } => ops::pfctl_add(from_port, to_port)
            .await
            .map(|_| serde_json::json!({"from": from_port, "to": to_port})),
        Request::PfctlRemove => ops::pfctl_remove().await.map(|_| serde_json::json!({})),
        Request::DhcpdRead => ops::dhcpd_read()
            .await
            .map(|leases| serde_json::json!({ "leases": leases })),
        Request::BridgeIp => ops::bridge_ip()
            .await
            .map(|ip| serde_json::json!({ "ip": ip })),
        Request::FullCleanup => {
            servers.disarm().await.ok();
            ops::full_cleanup().await.map(|_| serde_json::json!({}))
        }

        Request::ArmServers(spec) => servers.arm(spec).await.map(|_| serde_json::json!({})),
        Request::DisarmServers => servers.disarm().await.map(|_| serde_json::json!({})),
        Request::WaitManifest => match servers.manifest_notify().await {
            Some(n) => {
                n.notified().await;
                Ok(serde_json::json!({"event": "manifest_request"}))
            }
            None => Err(anyhow::anyhow!("servers not armed")),
        },
        Request::WaitFirmware => match servers.firmware_notify().await {
            Some(n) => {
                n.notified().await;
                Ok(serde_json::json!({"event": "firmware_streamed"}))
            }
            None => Err(anyhow::anyhow!("servers not armed")),
        },
    };

    match result {
        Ok(data) => Response::Ok { data },
        Err(e) => Response::Err {
            error: format!("{e:#}"),
        },
    }
}
