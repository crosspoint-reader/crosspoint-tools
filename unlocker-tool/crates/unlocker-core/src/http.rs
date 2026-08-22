//! Manifest server.
//!
//! Two listeners on the bridge IP:
//! * port 80 — plain HTTP. Serves the stock updater path.
//! * port 443 — HTTPS with the bundled Unlocker certificate chain. Handles the
//!   GitHub API spoof and firmware asset.
//!
//! The CrossPoint OTA path should look like a plain fixed-length HTTPS asset
//! download, not a chunked application stream.

use crate::cert::SelfSignedCert;
use crate::types::{Locale, Model, XotaOta};
use anyhow::Context as _;
use axum::{
    body::Body,
    extract::{Path as AxPath, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, Request as AxRequest, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use axum_server::{
    accept::Accept,
    tls_rustls::{RustlsAcceptor, RustlsConfig},
};
use bytes::Bytes;
use futures::Stream;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::future::Future;
use std::io;
use std::net::{IpAddr, SocketAddr, TcpListener};
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::task::{Context, Poll};
use tokio::net::TcpStream;
use tokio_rustls::server::TlsStream;

/// Body stream that yields the firmware in fixed-size chunks while logging
/// progress and final state. The Drop impl is the key piece: it tells us
/// whether the transfer finished cleanly or the connection was torn down
/// mid-stream (TLS error, RST, device aborted, etc.) — info we couldn't see
/// before when the body was a single `Body::from(Vec)`.
const FIRMWARE_CHUNK_SIZE: usize = 16 * 1024;

struct LoggedFirmwareStream {
    bytes: Bytes,
    offset: usize,
    total: usize,
    next_log_at: usize,
    path: String,
    finished: bool,
}

impl LoggedFirmwareStream {
    fn new(bytes: Bytes, path: String) -> Self {
        let total = bytes.len();
        Self {
            bytes,
            offset: 0,
            total,
            next_log_at: 0,
            path,
            finished: false,
        }
    }
}

/// Parse the ESP32 image header + `esp_app_desc_t` from the firmware bytes and
/// log the bits that `esp_https_ota_get_img_desc` checks against the running
/// app: chip_id, project_name, version, secure_version. Anti-rollback or
/// chip mismatch are the most common reasons the device aborts the OTA after
/// receiving only the first chunk — this log lets us confirm vs guess.
fn log_image_metadata(bytes: &[u8]) {
    // ESP32 image header is 24 bytes; segment 0 header is the next 8 bytes;
    // `esp_app_desc_t` begins at offset 32 and is at least 256 bytes long.
    if bytes.len() < 32 + 256 {
        tracing::warn!(len = bytes.len(), "firmware too short to parse app_desc");
        return;
    }
    let magic = bytes[0];
    let segment_count = bytes[1];
    let chip_id = u16::from_le_bytes([bytes[12], bytes[13]]);
    let Some(chip_name) = esp_chip_name(chip_id) else {
        tracing::warn!(magic, segment_count, chip_id, "unknown chip_id");
        return;
    };

    let desc = &bytes[32..32 + 256];
    let app_desc_magic = u32::from_le_bytes([desc[0], desc[1], desc[2], desc[3]]);
    if app_desc_magic != 0xABCD5432 {
        tracing::warn!(
            chip = chip_name,
            magic = format!("0x{app_desc_magic:08x}"),
            "app_desc magic mismatch — image may not be a standard ESP-IDF app"
        );
        return;
    }
    let secure_version = u32::from_le_bytes([desc[4], desc[5], desc[6], desc[7]]);
    let version = cstr_field(&desc[16..48]);
    let project_name = cstr_field(&desc[48..80]);
    let build_time = cstr_field(&desc[80..96]);
    let build_date = cstr_field(&desc[96..112]);
    let idf_ver = cstr_field(&desc[112..144]);

    tracing::info!(
        chip = chip_name,
        magic = format!("0x{magic:02x}"),
        segment_count,
        %project_name,
        %version,
        secure_version,
        %build_date,
        %build_time,
        %idf_ver,
        "firmware image metadata"
    );
}

fn cstr_field(b: &[u8]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    String::from_utf8_lossy(&b[..end]).into_owned()
}

fn esp_chip_name(chip_id: u16) -> Option<&'static str> {
    match chip_id {
        0x0000 => Some("ESP32"),
        0x0002 => Some("ESP32-S2"),
        0x0005 => Some("ESP32-C3"),
        0x0009 => Some("ESP32-S3"),
        0x000C => Some("ESP32-C2"),
        0x000D => Some("ESP32-C6"),
        0x0010 => Some("ESP32-H2"),
        _ => None,
    }
}

/// Finds the first occurrence of `needle` in `haystack`.
fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Wraps a plain TCP stream and logs the verbatim bytes of every HTTP response
/// head we write (status line + headers, up to the blank line). This is the
/// in-app equivalent of `tcpdump -A` on the bridge: it captures exactly what
/// hyper puts on the wire — the real `Content-Length` value + case, whether the
/// response is chunked, `Connection`, etc. — which a handler-level log can't see
/// (hyper serializes headers after the handler returns). Used to diagnose the
/// X4 Pro OTA driver reading our declared length as 0–202 (-104) despite our
/// intent to send a large `Content-Length`. Body bytes are never logged (we key
/// on writes that start with `HTTP/`).
struct ResponseHeadLogStream<S> {
    inner: S,
    peer: Option<SocketAddr>,
}

impl<S: tokio::io::AsyncRead + Unpin> tokio::io::AsyncRead for ResponseHeadLogStream<S> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl<S: tokio::io::AsyncWrite + Unpin> tokio::io::AsyncWrite for ResponseHeadLogStream<S> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = &mut *self;
        let n = match Pin::new(&mut this.inner).poll_write(cx, buf) {
            Poll::Ready(Ok(n)) => n,
            // Definitively attribute a mid-transfer drop: an error here means the
            // *peer* (device) tore the connection down (ConnectionReset /
            // BrokenPipe), so the drop is device-side, not ours.
            Poll::Ready(Err(e)) => {
                tracing::warn!(
                    peer = ?this.peer,
                    kind = ?e.kind(),
                    error = %e,
                    "outbound write failed — DEVICE closed the connection (peer-side drop)"
                );
                return Poll::Ready(Err(e));
            }
            pending => return pending,
        };
        // hyper writes the whole response head as one buffer beginning with the
        // status line; body chunks are separate writes. So only writes starting
        // with `HTTP/` are response heads.
        if n >= 5 && &buf[..5] == b"HTTP/" {
            let end = find_subsequence(&buf[..n], b"\r\n\r\n").unwrap_or(n.min(2048));
            let head = String::from_utf8_lossy(&buf[..end]);
            tracing::info!(peer = ?this.peer, "outbound HTTP response head (verbatim wire bytes):\n{head}");
        }
        Poll::Ready(Ok(n))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        // If we ever see this during a firmware transfer, the drop is OURS: the
        // server initiated the connection close (e.g. a teardown/timeout), not
        // the device.
        tracing::info!(peer = ?self.peer, "server initiating connection shutdown (our-side close)");
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

/// Acceptor that wraps each accepted plain-HTTP connection in
/// `ResponseHeadLogStream`. Mirrors `LoggingTlsAcceptor` but for the cleartext
/// listener (port 80), where the X4 Pro firmware download happens.
#[derive(Clone)]
struct HttpHeadLoggingAcceptor;

impl<S> Accept<TcpStream, S> for HttpHeadLoggingAcceptor
where
    S: Send + 'static,
{
    type Stream = ResponseHeadLogStream<TcpStream>;
    type Service = S;
    type Future =
        Pin<Box<dyn Future<Output = io::Result<(Self::Stream, Self::Service)>> + Send + 'static>>;

    fn accept(&self, stream: TcpStream, service: S) -> Self::Future {
        let peer = stream.peer_addr().ok();
        Box::pin(async move {
            Ok((
                ResponseHeadLogStream {
                    inner: stream,
                    peer,
                },
                service,
            ))
        })
    }
}

/// Adds connection and handshake diagnostics around axum-server's Rustls
/// acceptor. axum-server intentionally discards acceptor errors before the
/// HTTP middleware runs, so failures must be logged here.
#[derive(Clone)]
struct LoggingTlsAcceptor {
    inner: RustlsAcceptor,
}

impl LoggingTlsAcceptor {
    fn new(config: RustlsConfig) -> Self {
        Self {
            inner: RustlsAcceptor::new(config),
        }
    }
}

impl<S> Accept<TcpStream, S> for LoggingTlsAcceptor
where
    S: Send + 'static,
{
    type Stream = TlsStream<TcpStream>;
    type Service = S;
    type Future =
        Pin<Box<dyn Future<Output = io::Result<(Self::Stream, Self::Service)>> + Send + 'static>>;

    fn accept(&self, stream: TcpStream, service: S) -> Self::Future {
        let client = stream.peer_addr().ok();
        let local = stream.local_addr().ok();
        tracing::info!(?client, ?local, "incoming HTTPS TCP connection");
        tracing::info!(?client, "TLS handshake start");

        let handshake = self.inner.accept(stream, service);
        Box::pin(async move {
            match handshake.await {
                Ok((tls_stream, service)) => {
                    let connection = tls_stream.get_ref().1;
                    let tls_version = connection
                        .protocol_version()
                        .map(|version| format!("{version:?}"))
                        .unwrap_or_else(|| "unknown".to_string());
                    let cipher = connection
                        .negotiated_cipher_suite()
                        .map(|suite| format!("{:?}", suite.suite()))
                        .unwrap_or_else(|| "unknown".to_string());
                    let alpn = connection
                        .alpn_protocol()
                        .map(|value| String::from_utf8_lossy(value).into_owned())
                        .unwrap_or_else(|| "not negotiated".to_string());
                    let sni = connection
                        .server_name()
                        .map(str::to_owned)
                        .unwrap_or_else(|| "not supplied".to_string());

                    tracing::info!(
                        ?client,
                        %sni,
                        %tls_version,
                        %cipher,
                        %alpn,
                        "TLS handshake success"
                    );
                    Ok((tls_stream, service))
                }
                Err(error) => {
                    // RustlsAcceptor does not expose the partially parsed
                    // ClientHello when its handshake future fails, so SNI is
                    // only available on the successful path above.
                    tracing::error!(
                        ?client,
                        error = %error,
                        error_debug = ?error,
                        sni_available = false,
                        "TLS handshake failed"
                    );
                    Err(error)
                }
            }
        })
    }
}

/// Fixed-length variant of `LoggedFirmwareStream` for the X4 Pro `.xota`.
///
/// Implements `http_body::Body` with an *exact* `size_hint`, so hyper frames
/// the response with `Content-Length` (identity) instead of falling back to
/// `Transfer-Encoding: chunked` the way an unsized `Body::from_stream` does —
/// the factory OTA client resets the connection on chunked. Keeps the same
/// progress + clean-vs-early-close logging as the streaming variant, so the
/// server still tells us whether the device pulled the whole package (the only
/// instrument we have — the stock firmware's serial console is silent).
struct LoggedSizedBody {
    bytes: Bytes,
    offset: usize,
    total: usize,
    next_log_at: usize,
    path: String,
    finished: bool,
}

impl LoggedSizedBody {
    fn new(bytes: Bytes, path: String) -> Self {
        let total = bytes.len();
        Self {
            bytes,
            offset: 0,
            total,
            next_log_at: 0,
            path,
            finished: false,
        }
    }
}

impl http_body::Body for LoggedSizedBody {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
    ) -> Poll<Option<Result<http_body::Frame<Bytes>, Self::Error>>> {
        if self.offset >= self.total {
            self.finished = true;
            return Poll::Ready(None);
        }
        let end = (self.offset + FIRMWARE_CHUNK_SIZE).min(self.total);
        let chunk = self.bytes.slice(self.offset..end);
        self.offset = end;
        if self.offset >= self.next_log_at {
            tracing::info!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "xota stream progress"
            );
            self.next_log_at = self.offset + (self.total / 10).max(FIRMWARE_CHUNK_SIZE);
        }
        Poll::Ready(Some(Ok(http_body::Frame::data(chunk))))
    }

    fn is_end_stream(&self) -> bool {
        self.offset >= self.total
    }

    fn size_hint(&self) -> http_body::SizeHint {
        http_body::SizeHint::with_exact((self.total - self.offset) as u64)
    }
}

impl Drop for LoggedSizedBody {
    fn drop(&mut self) {
        // Treat "all bytes handed to hyper" as complete even if the final
        // `poll_frame` (which returns None) was never polled — hyper drops the
        // body once Content-Length bytes are sent, so `offset == total` is a
        // clean finish, not an early close.
        if self.finished || self.offset >= self.total {
            tracing::info!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "xota stream complete (full package handed to the socket)"
            );
        } else {
            tracing::warn!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "xota stream closed early (device disconnected mid-download)"
            );
        }
    }
}

impl Stream for LoggedFirmwareStream {
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.offset >= self.total {
            self.finished = true;
            return Poll::Ready(None);
        }
        let end = (self.offset + FIRMWARE_CHUNK_SIZE).min(self.total);
        let chunk = self.bytes.slice(self.offset..end);
        self.offset = end;
        if self.offset >= self.next_log_at {
            tracing::info!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "firmware stream progress"
            );
            // Log roughly every 10% of the transfer.
            self.next_log_at = self.offset + (self.total / 10).max(FIRMWARE_CHUNK_SIZE);
        }
        Poll::Ready(Some(Ok(chunk)))
    }
}

impl Drop for LoggedFirmwareStream {
    fn drop(&mut self) {
        if self.finished {
            tracing::info!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "firmware stream complete"
            );
        } else {
            tracing::warn!(
                path = %self.path,
                written = self.offset,
                total = self.total,
                "firmware stream closed early (peer disconnected or TLS error)"
            );
        }
    }
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub bridge_ip: String,
    pub bind_ip: IpAddr,
    pub model: Model,
    pub locale: Locale,
    pub firmware_path: PathBuf,
    pub firmware_size: u64,
    pub firmware_sha256: String,
    pub crosspoint_version: String,
    pub change_log: String,
    /// When true, crosspet devices get a plain-HTTP firmware URL instead of
    /// HTTPS (see `ArmServerSpec::crosspet_http`). User-controlled toggle.
    pub crosspet_http: bool,
    /// Capture-only mode: still log every request (that's the point), but make
    /// all update-check endpoints answer "no update available" so the device
    /// never downloads or flashes. See `ArmServerSpec::capture_only`.
    pub capture_only: bool,
    /// Channel-specific X4 Pro encrypted packages. Empty for plain firmware.
    pub xota_variants: Vec<XotaOta>,
    /// Notified on every manifest request. Orchestrator awaits the first
    /// notification to advance from AwaitingDeviceRequest.
    pub on_manifest_request: Arc<tokio::sync::Notify>,
    /// Notified when the firmware binary download completes.
    pub on_firmware_streamed: Arc<tokio::sync::Notify>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateQuery {
    #[serde(default)]
    pub current_version: String,
    #[serde(default)]
    pub device_type: String,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub lng: String,
    /// X4 Pro sends `ota_type` (`0` normal / `1` alternate). The plaintext is
    /// the same, but each channel uses a different XOTA key and metadata flag.
    #[serde(default)]
    pub ota_type: String,
}

#[derive(Debug, Serialize)]
pub struct Manifest {
    pub code: i32,
    pub data: ManifestData,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ManifestData {
    pub version: String,
    pub change_log: String,
    pub download_url: String,
    pub size: u64,
    pub upload_time: String,
    pub checksum: Option<String>,
}

pub fn router(cfg: Arc<ServerConfig>) -> Router {
    Router::new()
        .route("/api/v1/check-update", get(check_update))
        .route("/api/v1/device/binding/query", get(device_binding_query))
        .route("/api/v1/device/activate", post(device_activate))
        .route("/firmware/{filename}", get(serve_firmware))
        // GitHub-shaped OTA: CrossPoint, CrossInk, and CrossPoint KO all hit
        // `api.github.com/repos/{owner}/{repo}/releases/latest`. We DNS-spoof
        // api.github.com to ourselves, so any repo path lands here — answer
        // with our manifest regardless of which firmware variant is asking.
        .route(
            "/repos/{owner}/{repo}/releases/latest",
            get(github_releases_latest),
        )
        .route("/repos/{owner}/{repo}/releases", get(github_releases_list))
        // CPR-vCodex fork: manifest lives on GitHub Pages at
        // franssjz.github.io/cpr-vcodex/firmware/manifest.json. Schema is
        // custom (FirmwareManifestJsonParser only reads top-level `version`,
        // `downloadUrl`, `size`), not the GitHub releases shape.
        .route("/cpr-vcodex/firmware/manifest.json", get(vcodex_manifest))
        .fallback(catch_all)
        .layer(middleware::from_fn(log_request))
        .with_state(cfg)
}

/// Upper bound on how much request body we buffer for logging. Requests *to*
/// this server are tiny (a stock `check-update` GET carries none; `activate`
/// and friends post a small JSON envelope), so this never truncates real
/// traffic — it's only a guard against a pathological client streaming a huge
/// body at us. Firmware bytes flow the other way (a GET *response*), so they
/// aren't affected.
const MAX_LOGGED_BODY: usize = 1024 * 1024;

/// Full request capture for every request on a spoofed host.
///
/// The device's OTA/account traffic is exactly what we're reverse-engineering
/// (e.g. the X4 Pro's real `device_id` format, its `Authorization` bearer, and
/// which `device/tasks` / `subscription/task` / sync endpoints it calls), so
/// this logs the complete picture: method, full URI *including query string*,
/// every header, and the buffered body. The body must be read to bytes and the
/// request rebuilt from parts so the downstream handler still receives it.
///
/// This deliberately logs `Authorization` and any tokens verbatim — this is a
/// local debugging tool pointed at the user's own device, and those values are
/// the point of the capture. Don't ship these logs anywhere.
async fn log_request(req: AxRequest<Body>, next: Next) -> Response {
    let (parts, body) = req.into_parts();

    let method = parts.method.clone();
    let uri = parts.uri.clone();
    let host = parts
        .headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Render every header, values lossily (bearer tokens and device ids are
    // ASCII anyway). One entry per header keeps long tokens readable in logs.
    let headers: Vec<String> = parts
        .headers
        .iter()
        .map(|(name, value)| format!("{name}: {}", String::from_utf8_lossy(value.as_bytes())))
        .collect();

    // Buffer the body so we can log it and still forward it downstream.
    let bytes = match axum::body::to_bytes(body, MAX_LOGGED_BODY).await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(%method, %uri, %error, "failed to buffer request body for logging");
            Bytes::new()
        }
    };

    let body_repr = if bytes.is_empty() {
        "<empty>".to_string()
    } else if let Ok(text) = std::str::from_utf8(&bytes) {
        text.to_string()
    } else {
        format!("<{} non-utf8 bytes> {}", bytes.len(), hex::encode(&bytes))
    };

    tracing::info!(
        %method,
        %uri,
        %host,
        query = uri.query().unwrap_or(""),
        headers = ?headers,
        body_len = bytes.len(),
        body = %body_repr,
        "http request (full capture)"
    );

    next.run(AxRequest::from_parts(parts, Body::from(bytes)))
        .await
}

async fn check_update(
    State(cfg): State<Arc<ServerConfig>>,
    headers: HeaderMap,
    Query(q): Query<UpdateQuery>,
) -> Response {
    tracing::info!(
        host = ?headers.get(header::HOST),
        device_type = %q.device_type,
        current_version = %q.current_version,
        device_id = %q.device_id,
        capture_only = cfg.capture_only,
        "stock device requested update"
    );

    // notify_one buffers a permit if no waiter is registered yet — protects
    // against the device hitting check-update before the orchestrator has
    // begun awaiting the manifest event (e.g. when device discovery is slow).
    cfg.on_manifest_request.notify_one();

    // Capture-only: mirror the upstream "no update" envelope so the device
    // logs its request (already captured above + in the middleware) and then
    // leaves without downloading anything. Nothing is flashed.
    if cfg.capture_only {
        return Json(serde_json::json!({
            "code": 0,
            "data": null,
            "message": "No update available",
        }))
        .into_response();
    }

    // X4 Pro: the stock updater expects an `encrypted_v1` `.xota` and verifies
    // the decrypted image against `plain_sha256`. Variants are present only when we
    // armed with an encrypted package (see the install pipeline), so branch on
    // it rather than re-checking the model.
    if !cfg.xota_variants.is_empty() {
        return x4pro_check_update(&cfg, &q).into_response();
    }

    let filename = format!(
        "V99.9.9-{model}-{locale}-PROD-{date}.bin",
        model = cfg.model.short(),
        locale = cfg.locale.short(),
        date = chrono::Utc::now().format("%m%d"),
    );

    Json(Manifest {
        code: 0,
        data: ManifestData {
            version: "V99.9.9".into(),
            change_log: cfg.change_log.clone(),
            download_url: format!("http://{}/firmware/{}", cfg.bridge_ip, filename),
            size: cfg.firmware_size,
            upload_time: chrono::Utc::now().to_rfc3339(),
            checksum: Some(format!("sha256:{}", cfg.firmware_sha256)),
        },
        message: "Update available".into(),
    })
    .into_response()
}

/// Build the X4 Pro `encrypted_v1` `check-update` response.
///
/// Shape mirrors the real `api-prod.xteink.cc/api/v1/check-update` payload:
/// `data.checksum` is an object `{crc32, sha256}` (of the `.xota`), and the
/// extra `ota_format`/`ota_type`/`plain_size`/`plain_sha256`/`force_update`
/// fields drive the device's decrypt-then-verify path. The version is forced
/// high so the device always considers our image newer than what it's running.
fn x4pro_check_update(cfg: &ServerConfig, q: &UpdateQuery) -> Json<serde_json::Value> {
    // Serve the `.xota` over plain HTTP from the bridge IP: the device fetches
    // `download_url` directly (api-prod.xteink.cc is a plain-HTTP host for this
    // device), and the OTA payload's integrity is covered by the checksum +
    // plain_sha256 fields, not the transport.
    let requested_ota_type = q.ota_type.trim().parse::<u8>().unwrap_or(1);
    let xota = cfg
        .xota_variants
        .iter()
        .find(|xota| xota.ota_type == requested_ota_type)
        .unwrap_or(&cfg.xota_variants[0]);
    let ota_type = xota.ota_type;
    if ota_type != requested_ota_type {
        tracing::warn!(
            requested_ota_type,
            ota_type,
            "requested XOTA channel is unavailable; serving fallback"
        );
    }
    let filename = format!(
        "V99.9.9-X4Pro-{locale}-OTA{ota_type}-PROD-{date}.xota",
        locale = cfg.locale.short(),
        date = chrono::Utc::now().format("%m%d"),
    );
    // Serve over plain HTTP for now so the ResponseHeadLogStream tee on :80 can
    // capture the exact drop event (write error vs our shutdown). HTTP vs HTTPS
    // made no difference to the failure. Flip back to
    // https://unlocker.crosspointreader.com once the drop direction is known.
    let download_url = format!("http://{}/firmware/{}", cfg.bridge_ip, filename);

    tracing::info!(
        %download_url,
        xota_size = xota.firmware_size,
        plain_size = xota.plain_size,
        ota_type,
        "serving X4 Pro encrypted_v1 manifest"
    );

    // The real check-update sets `checksum.sha256` == `plain_sha256` (both are
    // the sha256 of the *decrypted* image, which the device verifies after
    // decrypting the `.xota`) and `checksum.crc32` == null. Serving the `.xota`'s
    // own sha here is a guaranteed post-decrypt verification failure — use the
    // plain image sha to match the device's check.
    Json(serde_json::json!({
        "code": 0,
        "message": "Update available",
        "data": {
            "version": "V99.9.9",
            "change_log": cfg.change_log,
            "download_url": download_url,
            "size": xota.firmware_size,
            "upload_time": chrono::Utc::now().to_rfc3339(),
            "checksum": {
                "crc32": serde_json::Value::Null,
                "sha256": xota.plain_sha256,
            },
            "force_update": true,
            "ota_format": "encrypted_v1",
            "ota_type": ota_type,
            "plain_size": xota.plain_size,
            "plain_sha256": xota.plain_sha256,
        },
    }))
}

async fn serve_firmware(
    State(cfg): State<Arc<ServerConfig>>,
    headers: HeaderMap,
    AxPath(filename): AxPath<String>,
) -> Result<Response, StatusCode> {
    let xota = if cfg.xota_variants.is_empty() {
        None
    } else {
        cfg.xota_variants
            .iter()
            .find(|xota| filename.contains(&format!("-OTA{}-", xota.ota_type)))
    };
    if !cfg.xota_variants.is_empty() && xota.is_none() {
        tracing::warn!(%filename, "firmware URL does not name an available XOTA channel");
        return Err(StatusCode::NOT_FOUND);
    }
    let (firmware_path, size, expected_sha256) = if let Some(xota) = xota {
        (
            std::path::Path::new(&xota.firmware_path),
            xota.firmware_size,
            xota.firmware_sha256.as_str(),
        )
    } else {
        (
            cfg.firmware_path.as_path(),
            cfg.firmware_size,
            cfg.firmware_sha256.as_str(),
        )
    };
    tracing::info!(
        %filename,
        path = %firmware_path.display(),
        size,
        range = ?headers.get(header::RANGE),
        ?headers,
        "firmware download requested"
    );
    let range = parse_range(headers.get(header::RANGE), size)?;
    tracing::info!(size, ?range, "serving firmware");
    // Advance the app UI as soon as the device begins the firmware GET.
    // Waiting for the whole transfer to finish hides the install screen while
    // the device is already on its OTA progress view.
    cfg.on_firmware_streamed.notify_one();

    let bytes = match tokio::fs::read(firmware_path).await {
        Ok(b) => b,
        Err(e) => {
            // Previously this mapped silently to 404 and the device gave up
            // with no diagnostic in the log. The common failure is the helper
            // running as root via osascript admin, where macOS TCC blocks
            // reads from ~/Downloads/~/Desktop/etc. even for root. Surface
            // the underlying io error so we can tell EPERM from ENOENT.
            tracing::error!(
                path = %firmware_path.display(),
                error = %e,
                kind = ?e.kind(),
                "failed to read firmware file from disk"
            );
            return Err(StatusCode::NOT_FOUND);
        }
    };
    let served_sha256 = hex::encode(Sha256::digest(&bytes));
    let head24 = hex::encode(&bytes[..bytes.len().min(24)]);
    if !served_sha256.eq_ignore_ascii_case(expected_sha256) {
        tracing::error!(
            path = %firmware_path.display(),
            expected_sha256,
            served_sha256 = %served_sha256,
            head24 = %head24,
            "refusing to serve firmware because bytes on disk do not match selected firmware hash"
        );
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    tracing::info!(
        path = %firmware_path.display(),
        served_sha256 = %served_sha256,
        head24 = %head24,
        "firmware bytes loaded for response"
    );

    log_image_metadata(&bytes);

    let path_for_log = firmware_path.display().to_string();

    // X4 Pro full download: emit the response headers in the exact order the
    // real AliyunOSS server uses, with `Content-Length` immediately after the
    // status line / `Content-Type`. The stock OTA driver rejects with -104
    // ("content length invalid") when `esp_http_client_get_content_length()`
    // reads 0–202 — even though we demonstrably put `Content-Length: <full
    // size>` on the wire. The one remaining difference from the working real
    // response was header *order*: ours placed `Content-Length` 4th (after
    // Content-Disposition, ~byte 112), the real server places it 2nd (~byte 57).
    // A bounded header buffer/scan on the device would miss a late one. Match
    // the real order exactly: Content-Type, Content-Length, Connection,
    // Accept-Ranges, Content-Disposition.
    if xota.is_some() && range.is_none() {
        // Match the real AliyunOSS download response the device successfully
        // pulls 5.5 MB from: Content-Length + Connection: close + Accept-Ranges:
        // bytes, plus the integrity headers OSS sends — `Content-MD5`
        // (base64 of the body MD5) and `ETag` (uppercase-hex of the same MD5).
        // If the firmware validates or requires these, a bare response reads as
        // "no messages". (Earlier removing Accept-Ranges / using keep-alive was
        // based on theories the real server's own headers disprove.)
        use base64::Engine as _;
        let md5 = md5::Md5::digest(&bytes);
        let content_md5 = base64::engine::general_purpose::STANDARD.encode(md5);
        let etag = format!("\"{}\"", hex::encode_upper(md5));
        let resp = Response::builder()
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_LENGTH, size)
            .header(header::CONNECTION, "close")
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::ETAG, etag)
            .header(
                header::LAST_MODIFIED,
                chrono::Utc::now()
                    .format("%a, %d %b %Y %H:%M:%S GMT")
                    .to_string(),
            )
            .header(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_static("attachment"),
            )
            .header("Content-MD5", content_md5)
            .body(Body::new(LoggedSizedBody::new(
                Bytes::from(bytes),
                path_for_log,
            )))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        tracing::info!(
            size,
            "serving X4 Pro .xota (real-order headers + Content-MD5/ETag)"
        );
        return Ok(resp);
    }

    // The X4 Pro OTA driver validates the `Content-Length` header (rejects with
    // -104 "content length invalid" otherwise). Keep its response lean and
    // identical in spirit to the real OSS download — just content-type,
    // accept-ranges, and a bare `attachment` disposition — so nothing crowds
    // out or confuses the device's header parse. The X3/X4 path keeps the extra
    // diagnostic headers it's always had.
    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::ACCEPT_RANGES, "bytes");
    if xota.is_some() {
        builder = builder.header(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_static("attachment"),
        );
    } else {
        builder = builder
            .header(header::CACHE_CONTROL, "no-store")
            .header("X-Firmware-Sha256", served_sha256)
            .header("X-Firmware-Head24", head24)
            .header(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_static("attachment; filename=firmware.bin"),
            );
    }

    let body = match range {
        Some((start, end)) => {
            let content_len = end - start + 1;
            let start = start as usize;
            let end_inclusive = end as usize;
            let chunk = bytes
                .get(start..=end_inclusive)
                .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
                .to_vec();
            builder = builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
                .header(header::CONTENT_LENGTH, content_len);
            Body::from_stream(LoggedFirmwareStream::new(Bytes::from(chunk), path_for_log))
        }
        None => {
            builder = builder.header(header::CONTENT_LENGTH, size);
            if xota.is_some() {
                // X4 Pro: serve the whole `.xota` as a single fixed-length body,
                // exactly like the real OSS download (Content-Length + Connection:
                // close, no chunked). `Body::from_stream` yields an unknown-length
                // body, so hyper falls back to `Transfer-Encoding: chunked` — but
                // the factory OTA client advertises `identity;q=1,chunked;q=0.1`
                // and has been observed to reset the connection mid-stream when it
                // gets chunked. A sized `Bytes` body guarantees identity framing.
                builder = builder.header(header::CONNECTION, "close");
                tracing::info!(
                    size,
                    "serving X4 Pro .xota as fixed-length body (identity, connection: close)"
                );
                Body::new(LoggedSizedBody::new(Bytes::from(bytes), path_for_log))
            } else {
                Body::from_stream(LoggedFirmwareStream::new(Bytes::from(bytes), path_for_log))
            }
        }
    };

    Ok(builder.body(body).unwrap())
}

fn parse_range(range: Option<&HeaderValue>, size: u64) -> Result<Option<(u64, u64)>, StatusCode> {
    let Some(range) = range else {
        return Ok(None);
    };

    let raw = range
        .to_str()
        .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
    let raw = raw
        .strip_prefix("bytes=")
        .ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?;

    if raw.contains(',') {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }

    let (start_raw, end_raw) = raw
        .split_once('-')
        .ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?;

    if size == 0 {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }

    let last = size - 1;

    let (start, end) = if start_raw.is_empty() {
        let suffix_len: u64 = end_raw
            .parse()
            .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
        if suffix_len == 0 {
            return Err(StatusCode::RANGE_NOT_SATISFIABLE);
        }
        let start = size.saturating_sub(suffix_len);
        (start, last)
    } else {
        let start: u64 = start_raw
            .parse()
            .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
        let end = if end_raw.is_empty() {
            last
        } else {
            end_raw
                .parse()
                .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?
        };
        (start, end)
    };

    if start > end || end >= size {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }

    Ok(Some((start, end)))
}

/// Spoofs `GET /repos/{owner}/{repo}/releases/latest` for any repo. Used by
/// CrossPoint, CrossInk, and CrossPoint KO firmwares — they all check GitHub
/// for updates, just under different repo paths.
async fn github_releases_latest(
    State(cfg): State<Arc<ServerConfig>>,
    AxPath((owner, repo)): AxPath<(String, String)>,
    headers: HeaderMap,
) -> Response {
    tracing::info!(
        host = ?headers.get(header::HOST),
        user_agent = ?headers.get(header::USER_AGENT),
        %owner, %repo,
        capture_only = cfg.capture_only,
        "device requested update via GitHub API (latest)"
    );

    cfg.on_manifest_request.notify_one();
    // Capture-only: no release, so CrossPoint/CrossInk/INX see "up to date".
    if cfg.capture_only {
        return StatusCode::NOT_FOUND.into_response();
    }
    let release = build_release(&cfg, &repo);
    if repo.eq_ignore_ascii_case("biscuit") {
        biscuit_manifest_response(release)
    } else {
        Json(release).into_response()
    }
}

fn biscuit_manifest_response(release: serde_json::Value) -> Response {
    let body = serde_json::to_vec(&release).expect("serializing a JSON value cannot fail");
    tracing::info!(
        content_length = body.len(),
        json = %String::from_utf8_lossy(&body),
        "serving fixed-length Biscuit manifest response"
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CONTENT_LENGTH, body.len())
        .body(Body::from(body))
        .expect("static Biscuit response headers are valid")
}

/// Spoofs `GET /repos/{owner}/{repo}/releases`.
///
/// INX 1.0.12 queries this list endpoint, but its parser treats the body as a
/// single release object instead of GitHub's normal release array. Return the
/// object shape for INX so those builds can advance to the confirmation screen.
/// Other GitHub-shaped firmwares get the normal single-element array.
async fn github_releases_list(
    State(cfg): State<Arc<ServerConfig>>,
    AxPath((owner, repo)): AxPath<(String, String)>,
    headers: HeaderMap,
) -> Response {
    tracing::info!(
        host = ?headers.get(header::HOST),
        user_agent = ?headers.get(header::USER_AGENT),
        %owner, %repo,
        capture_only = cfg.capture_only,
        "device requested update via GitHub API (list)"
    );

    cfg.on_manifest_request.notify_one();
    // Capture-only: empty release list so nothing is offered.
    if cfg.capture_only {
        return Json(serde_json::Value::Array(vec![])).into_response();
    }
    let release = build_release(&cfg, &repo);
    if repo.eq_ignore_ascii_case("inx") {
        Json(release).into_response()
    } else {
        Json(serde_json::Value::Array(vec![release])).into_response()
    }
}

fn build_release(cfg: &ServerConfig, repo: &str) -> serde_json::Value {
    // Serve most GitHub-shaped firmware downloads over plain HTTP rather
    // than HTTPS. Two reasons:
    //
    // 1. On memory-constrained devices (X3 in particular) `esp_https_ota_begin`
    //    fails with `ESP_ERR_NO_MEM` because mbedTLS + the HTTP client + the
    //    OTA upgrade buffer don't fit in the largest free contiguous block.
    //    Plain HTTP skips mbedTLS entirely, freeing ~25–40 KB of contiguous
    //    heap at exactly the call that's been failing.
    // 2. The transport security HTTPS would buy us is moot here: we own the
    //    bridge100 hotspot, the DNS resolver, and the served bytes. Nothing
    //    can MITM the device on this private network.
    //
    // Requires `CONFIG_OTA_ALLOW_HTTP=y` in the device firmware's sdkconfig
    // (default in arduino-esp32). INX calls `esp_https_ota_begin()` and does
    // not carry an sdkconfig override enabling HTTP OTA, so give INX an HTTPS
    // URL. Our cert is valid for unlocker.crosspointreader.com and that host is
    // DNS-spoofed to the local helper.
    //
    // crosspet (trilwu/crosspet, a CrossPoint fork) defaults to HTTPS like INX,
    // on the belief that its `esp_https_ota` rejects a plain-HTTP firmware URL
    // (no `CONFIG_OTA_ALLOW_HTTP` in the repo). But HTTPS has been observed to
    // abort the OTA early on these memory-constrained devices — the device gets
    // the manifest and begins the TLS download, then tears the connection down
    // at the first chunk (mbedTLS heap pressure). The `crosspet_http` toggle
    // (Settings UI → ServerConfig) lets the user serve crosspet over plain HTTP
    // instead, matching CrossPoint/CrossInk and sidestepping the TLS memory cost.
    // Its check leg already succeeds regardless because crosspet uses
    // `esp_crt_bundle_attach` (chain-only validation, no hostname enforcement).
    let is_inx = repo.eq_ignore_ascii_case("inx");
    let is_crosspet = repo.eq_ignore_ascii_case("crosspet");
    let is_biscuit = repo.eq_ignore_ascii_case("biscuit");

    let crosspet_http = is_crosspet && cfg.crosspet_http;
    let scheme = if is_biscuit || (is_inx || is_crosspet) && !crosspet_http {
        "https"
    } else {
        "http"
    };
    let download_url = format!("{scheme}://unlocker.crosspointreader.com/firmware/firmware.bin");

    // `tag_name` stays unprefixed — CrossPoint's `sscanf("%d.%d.%d")` would
    // fail on a leading `v`. CrossInk's parser strips the optional `v`, so
    // unprefixed is accepted by both for the tag.
    let tag = "99.9.9";
    let asset = |name: String| {
        serde_json::json!({
            "name": name,
            "browser_download_url": download_url,
            "size": cfg.firmware_size,
            "content_type": "application/octet-stream",
        })
    };

    // Identify CrossInk by the repo path. Their build advertises variants and
    // expects the `v`-prefixed canonical filename (`firmware-<variant>-v<ver>.bin`)
    // per the maintainer. Other GitHub-shaped firmwares (CrossPoint, KO) look for
    // a plain `firmware.bin`; mixing the variant entries into their manifest is
    // unnecessary and could trip stricter parsers in future revisions.
    let is_crossink = repo.eq_ignore_ascii_case("crossink");
    let assets = if is_crossink {
        // Variants come from CrossInk's platformio.ini (`tiny`, `xlarge`,
        // `no_emoji`). All point at the same firmware bytes — the device's
        // variant matcher picks the one for its build.
        //
        // The asset filename's version MUST equal `tag_name`. CrossInk <= 1.2.x
        // derives the expected asset name from tag_name and accepts only
        // `firmware-<variant>-v<tag>.bin`, `firmware-<variant>-<tag>.bin`, or the
        // bare `firmware-<variant>.bin`; a mismatched version (e.g. the old
        // `v99.9.9.1` vs tag `99.9.9`) makes checkForUpdate() return NO_UPDATE
        // before it ever downloads. CrossInk 1.3+/1.4+ matches by prefix and
        // ignores the version, so a tag-aligned name works for every build.
        // Emit the bare name too — it hits the unconditional match in all
        // versions, covering any other old strict matcher.
        ["no_emoji", "tiny", "xlarge"]
            .iter()
            .flat_map(|v| {
                [
                    asset(format!("firmware-{v}.bin")),
                    asset(format!("firmware-{v}-v{tag}.bin")),
                ]
            })
            .collect::<Vec<_>>()
    } else {
        vec![asset("firmware.bin".to_string())]
    };

    // Use a very high version so the device always considers it newer.
    // CrossPoint's version check uses sscanf("%d.%d.%d") so this parses
    // as 99.9.9 which is greater than any real version.
    tracing::info!(%download_url, %tag, is_biscuit, is_crossink, is_inx, is_crosspet, crosspet_http, "serving manifest");

    serde_json::json!({
        "tag_name": tag,
        "name": format!("CrossPoint {}", cfg.crosspoint_version),
        "assets": assets,
    })
}

/// Spoofs the CPR-vCodex fork's OTA manifest. The fork's
/// `FirmwareManifestJsonParser` only reads top-level `version`, `downloadUrl`,
/// and `size`; everything else (name, sha256, source, builds, …) is ignored.
/// Download uses `esp_http_client`/`HttpDownloader`, not `esp_https_ota`, so
/// the plain-HTTP firmware URL works without `CONFIG_OTA_ALLOW_HTTP`.
async fn vcodex_manifest(State(cfg): State<Arc<ServerConfig>>, headers: HeaderMap) -> Response {
    tracing::info!(
        host = ?headers.get(header::HOST),
        user_agent = ?headers.get(header::USER_AGENT),
        capture_only = cfg.capture_only,
        "device requested update via CPR-vCodex manifest"
    );

    cfg.on_manifest_request.notify_one();

    // Capture-only: 404 so the fork's parser finds no manifest and offers
    // nothing.
    if cfg.capture_only {
        return StatusCode::NOT_FOUND.into_response();
    }

    let download_url = "http://unlocker.crosspointreader.com/firmware/firmware.bin";
    tracing::info!(%download_url, "serving vcodex manifest");

    Json(serde_json::json!({
        "version": "99.9.9",
        "downloadUrl": download_url,
        "size": cfg.firmware_size,
    }))
    .into_response()
}

/// `GET /api/v1/device/binding/query` — the device asks whether it's bound to
/// an Xteink account. The real server answers `{"success":false,"data":null}`
/// for an unbound device (a distinct envelope from the `{code,data,message}`
/// used by check-update — this endpoint is on the newer FastAPI stack). A
/// factory device OTAs *before* it's bound, so mirror the real "not bound"
/// response verbatim: the generic `catch_all` stub (`{code:0,...,data:{}}`)
/// returns a non-null `data`, which the firmware could misread as "bound" and
/// branch into an account-only path that then fails.
async fn device_binding_query(headers: HeaderMap) -> Json<serde_json::Value> {
    tracing::info!(
        device_id = ?headers.get("device_id"),
        device_type = ?headers.get("device_type"),
        "device binding query (answering not-bound)"
    );
    Json(serde_json::json!({ "success": false, "data": serde_json::Value::Null }))
}

/// Stub for `POST /api/v1/device/activate` — V5.5.3+ stock firmware POSTs here
/// on boot. Returning 404 was harmless for the OTA itself (the device still
/// downloaded the manifest and firmware) but surfaced as a user-visible error
/// on the device UI. Reply with the same `{code:0,message:"ok",data:{}}`
/// envelope the real Xteink API uses so the device treats activation as
/// successful.
async fn device_activate(headers: HeaderMap, body: String) -> Json<serde_json::Value> {
    tracing::info!(
        host = ?headers.get(header::HOST),
        device_id = ?headers.get("device_id"),
        device_type = ?headers.get("device_type"),
        device_version = ?headers.get("device_version"),
        body_len = body.len(),
        "device activate (stubbed ok)"
    );
    Json(serde_json::json!({
        "code": 0,
        "message": "ok",
        "data": {},
    }))
}

/// Fallback for any request on a spoofed host that didn't match a route.
///
/// Returns a benign `{code:0,message:"ok",data:{}}` envelope instead of 404.
/// The unlocker only sees traffic for hosts it DNS-spoofs, so this fires only
/// on Xteink API paths we don't yet know about. Logging at `warn` keeps the
/// URI visible so we can add a real handler the next time the firmware adds
/// an endpoint.
async fn catch_all(
    method: Method,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: axum::body::Bytes,
) -> Response {
    // The device reports OTA/download failures back to its cloud with a JSON
    // telemetry POST — e.g. `{"event":"download_task_failed","error_code":%d,
    // "http_code":%d,...}` — and those requests land here (their host is DNS
    // spoofed to us). Logging the body surfaces the *exact* `ota_cloud` error
    // code (target mismatch / hash mismatch / ota write failed / …) instead of
    // the generic on-screen "network error", so we can see why a package was
    // rejected. Bodies are small telemetry blobs; cap the log to be safe.
    let body_str = String::from_utf8_lossy(&body);
    let body_preview: String = body_str.chars().take(2048).collect();
    tracing::warn!(
        %method,
        ?uri,
        ?headers,
        body = %body_preview,
        body_len = body.len(),
        "unknown request — returning ok stub"
    );
    Json(serde_json::json!({
        "code": 0,
        "message": "ok",
        "data": {},
    }))
    .into_response()
}

pub struct ServerHandles {
    pub http: tokio::task::JoinHandle<std::io::Result<()>>,
    pub https: tokio::task::JoinHandle<std::io::Result<()>>,
    pub http_handle: axum_server::Handle<SocketAddr>,
    pub https_handle: axum_server::Handle<SocketAddr>,
    shutdown_requested: Arc<AtomicBool>,
}

impl ServerHandles {
    pub async fn shutdown(self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
        self.http_handle.shutdown();
        self.https_handle.shutdown();
        report_server_join("HTTP", self.http.await);
        report_server_join("HTTPS", self.https.await);
    }
}

fn report_server_join(
    server: &'static str,
    result: Result<io::Result<()>, tokio::task::JoinError>,
) {
    match result {
        Ok(Ok(())) => tracing::info!(server, "server task joined"),
        Ok(Err(error)) => tracing::error!(server, error = %error, "server task returned an error"),
        Err(error) => tracing::error!(server, error = %error, "server supervisor task failed"),
    }
}

fn bind_server_listener(addr: SocketAddr, server: &'static str) -> anyhow::Result<TcpListener> {
    let listener = TcpListener::bind(addr)
        .map_err(|error| {
            tracing::error!(server, %addr, error = %error, "failed to bind server socket");
            error
        })
        .with_context(|| format!("failed to bind {server} server socket on {addr}"))?;
    listener
        .set_nonblocking(true)
        .with_context(|| format!("failed to set {server} listener on {addr} nonblocking"))?;
    tracing::info!(server, %addr, "server socket bound");
    Ok(listener)
}

async fn supervise_server<F>(
    server: &'static str,
    shutdown_requested: Arc<AtomicBool>,
    future: F,
) -> io::Result<()>
where
    F: Future<Output = io::Result<()>> + Send + 'static,
{
    match tokio::spawn(future).await {
        Ok(result) => {
            let expected = shutdown_requested.load(Ordering::SeqCst);
            match (&result, expected) {
                (Ok(()), true) => tracing::info!(server, "server stopped after shutdown request"),
                (Ok(()), false) => tracing::warn!(server, "server task terminated unexpectedly"),
                (Err(error), _) => {
                    tracing::error!(server, error = %error, expected, "server task terminated with error")
                }
            }
            result
        }
        Err(error) => {
            tracing::error!(server, error = %error, "server task panicked or was cancelled");
            Err(io::Error::other(format!(
                "{server} server task panicked or was cancelled: {error}"
            )))
        }
    }
}

pub async fn start(cfg: Arc<ServerConfig>, cert: &SelfSignedCert) -> anyhow::Result<ServerHandles> {
    let app = router(cfg.clone());

    let http_addr = SocketAddr::new(cfg.bind_ip, 80);
    let https_addr = SocketAddr::new(cfg.bind_ip, 443);

    // HTTPS listener. Force HTTP/1.1 only — ESP32's esp_http_client
    // doesn't support HTTP/2, and ALPN negotiation can cause issues.
    let certs =
        rustls_pemfile::certs(&mut cert.cert_pem.as_bytes()).collect::<Result<Vec<_>, _>>()?;
    let key = rustls_pemfile::private_key(&mut cert.key_pem.as_bytes())?
        .ok_or_else(|| anyhow::anyhow!("no private key found in PEM"))?;

    // Log the leaf cert's subject + SANs so we can confirm the cert we present
    // covers the hostnames the device will request. esp_https_ota verifies the
    // server hostname against the cert SAN list after the handshake — if our
    // cert only covers some of the spoofed hostnames, the device will tear
    // down the connection right after handshake with no visible logs on our
    // side. Logging once at boot makes that misconfiguration obvious.
    if let Some(leaf) = certs.first() {
        match x509_parser::parse_x509_certificate(leaf.as_ref()) {
            Ok((_, parsed)) => {
                let subject = parsed.subject().to_string();
                let sans: Vec<String> = parsed
                    .extensions()
                    .iter()
                    .filter_map(|ext| match ext.parsed_extension() {
                        x509_parser::extensions::ParsedExtension::SubjectAlternativeName(san) => {
                            Some(
                                san.general_names
                                    .iter()
                                    .map(|n| format!("{n:?}"))
                                    .collect::<Vec<_>>()
                                    .join(", "),
                            )
                        }
                        _ => None,
                    })
                    .collect();
                let not_before = parsed.validity().not_before.to_string();
                let not_after = parsed.validity().not_after.to_string();
                tracing::info!(%subject, sans = ?sans, %not_before, %not_after, "tls cert loaded");
            }
            Err(e) => tracing::warn!(error = %e, "failed to parse leaf cert for SAN logging"),
        }
    }

    let mut server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    server_config.alpn_protocols = vec![b"http/1.1".to_vec()];
    let tls = RustlsConfig::from_config(std::sync::Arc::new(server_config));

    // Bind both privileged sockets synchronously. Returning from this function
    // now proves that both listeners exist; the UI must not report "armed" on
    // the strength of spawned tasks that have not attempted their binds yet.
    let http_listener = bind_server_listener(http_addr, "HTTP")?;
    let https_listener = bind_server_listener(https_addr, "HTTPS")?;

    let http_handle = axum_server::Handle::new();
    let https_handle = axum_server::Handle::new();
    let shutdown_requested = Arc::new(AtomicBool::new(false));

    // Emit HTTP/1.1 response header names in Title-Case (`Content-Length`, not
    // hyper's default lowercase `content-length`). The X4 Pro's OTA download
    // driver parses `Content-Length` case-sensitively — with the lowercase name
    // it reads the length as 0 and rejects the transfer with -104 ("content
    // length invalid"). Real Xteink servers (AliyunOSS) send Title-Case, so this
    // matches them. `preserve_header_case` keeps any names we set explicitly.

    // Plain HTTP listener.
    let app_http = app.clone();
    let h1 = http_handle.clone();
    let mut http_server = axum_server::from_tcp(http_listener)?;
    http_server
        .http_builder()
        .http1()
        .title_case_headers(true)
        .preserve_header_case(true);
    // Log the verbatim response-head bytes we put on the wire (see
    // ResponseHeadLogStream) so we can see exactly what Content-Length the X4
    // Pro's OTA client actually receives.
    let http_server = http_server.acceptor(HttpHeadLoggingAcceptor).handle(h1);

    let app_https = app.clone();
    let h2 = https_handle.clone();
    let https_acceptor = LoggingTlsAcceptor::new(tls);
    let mut https_server = axum_server::from_tcp(https_listener)?;
    https_server
        .http_builder()
        .http1()
        .title_case_headers(true)
        .preserve_header_case(true);
    let https_server = https_server.acceptor(https_acceptor).handle(h2);

    let http_shutdown = shutdown_requested.clone();
    let http = tokio::spawn(supervise_server(
        "HTTP",
        http_shutdown,
        http_server.serve(app_http.into_make_service()),
    ));
    let https_shutdown = shutdown_requested.clone();
    let https = tokio::spawn(supervise_server(
        "HTTPS",
        https_shutdown,
        https_server.serve(app_https.into_make_service()),
    ));

    tracing::info!(%http_addr, %https_addr, "manifest servers ready; both sockets bound");

    Ok(ServerHandles {
        http,
        https,
        http_handle,
        https_handle,
        shutdown_requested,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use tower::ServiceExt;

    const TEST_FIRMWARE_SIZE: u64 = 446_736;
    const BISCUIT_FIRMWARE_URL: &str =
        "https://unlocker.crosspointreader.com/firmware/firmware.bin";

    fn test_config(crosspet_http: bool) -> Arc<ServerConfig> {
        Arc::new(ServerConfig {
            bridge_ip: "192.168.137.1".to_string(),
            bind_ip: "192.168.137.1".parse().unwrap(),
            model: Model::X4,
            locale: Locale::English,
            firmware_path: PathBuf::from("firmware.bin"),
            firmware_size: TEST_FIRMWARE_SIZE,
            firmware_sha256: "00".repeat(32),
            crosspoint_version: "test".to_string(),
            change_log: "test".to_string(),
            crosspet_http,
            capture_only: false,
            xota_variants: Vec::new(),
            on_manifest_request: Arc::new(tokio::sync::Notify::new()),
            on_firmware_streamed: Arc::new(tokio::sync::Notify::new()),
        })
    }

    fn asset_urls(release: &serde_json::Value) -> Vec<&str> {
        release["assets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|asset| asset["browser_download_url"].as_str().unwrap())
            .collect()
    }

    #[tokio::test]
    async fn biscuit_manifest_is_exact_and_fixed_length() {
        let response = router(test_config(false))
            .oneshot(
                AxRequest::builder()
                    .uri("/repos/yattsu/biscuit/releases/latest")
                    .header(header::HOST, "api.github.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert!(response.headers().get(header::TRANSFER_ENCODING).is_none());

        let declared_length: usize = response
            .headers()
            .get(header::CONTENT_LENGTH)
            .unwrap()
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(declared_length, body.len());

        let expected = serde_json::json!({
            "tag_name": "99.9.9",
            "name": "CrossPoint test",
            "assets": [{
                "name": "firmware.bin",
                "browser_download_url": BISCUIT_FIRMWARE_URL,
                "size": TEST_FIRMWARE_SIZE,
                "content_type": "application/octet-stream",
            }],
        });
        assert_eq!(body.as_ref(), serde_json::to_vec(&expected).unwrap());

        let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed["tag_name"], "99.9.9");
        let assets = parsed["assets"].as_array().unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0]["name"], "firmware.bin");
        assert_eq!(assets[0]["browser_download_url"], BISCUIT_FIRMWARE_URL);
        assert_eq!(assets[0]["size"], TEST_FIRMWARE_SIZE);
    }

    #[tokio::test]
    async fn stock_and_vcodex_routes_remain_unchanged() {
        let app = router(test_config(false));
        let stock_response = app
            .clone()
            .oneshot(
                AxRequest::builder()
                    .uri("/api/v1/check-update")
                    .header(header::HOST, "api-prod.xteink.cc")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let stock_body = to_bytes(stock_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let stock: serde_json::Value = serde_json::from_slice(&stock_body).unwrap();
        assert_eq!(stock["code"], 0);
        assert_eq!(stock["data"]["version"], "V99.9.9");
        assert_eq!(stock["data"]["size"], TEST_FIRMWARE_SIZE);
        let stock_url = stock["data"]["download_url"].as_str().unwrap();
        assert!(stock_url.starts_with("http://192.168.137.1/firmware/V99.9.9-X4-EN-PROD-"));
        assert!(stock_url.ends_with(".bin"));

        let vcodex_response = app
            .oneshot(
                AxRequest::builder()
                    .uri("/cpr-vcodex/firmware/manifest.json")
                    .header(header::HOST, "franssjz.github.io")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let vcodex_body = to_bytes(vcodex_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let vcodex: serde_json::Value = serde_json::from_slice(&vcodex_body).unwrap();
        assert_eq!(vcodex["version"], "99.9.9");
        assert_eq!(
            vcodex["downloadUrl"],
            "http://unlocker.crosspointreader.com/firmware/firmware.bin"
        );
        assert_eq!(vcodex["size"], TEST_FIRMWARE_SIZE);
    }

    /// X4 Pro: when armed with `xota` info, `check-update` returns the
    /// `encrypted_v1` manifest shape (checksum object, plain_size/plain_sha256,
    /// ota_format), a `.xota` download URL, and echoes the requested ota_type.
    #[tokio::test]
    async fn x4pro_check_update_returns_encrypted_v1_manifest() {
        let mut cfg = (*test_config(false)).clone();
        cfg.model = Model::X4Pro;
        cfg.firmware_sha256 = "ab".repeat(32);
        cfg.xota_variants = vec![
            XotaOta {
                ota_type: 1,
                firmware_path: "wrong-channel.xota".to_string(),
                firmware_size: 1,
                firmware_sha256: "ef".repeat(32),
                plain_size: 1,
                plain_sha256: "ef".repeat(32),
                xota_crc32: 0,
            },
            XotaOta {
                ota_type: 0,
                firmware_path: "firmware.bin".to_string(),
                firmware_size: TEST_FIRMWARE_SIZE,
                firmware_sha256: "ab".repeat(32),
                plain_size: 518_560,
                plain_sha256: "cd".repeat(32),
                xota_crc32: 0x1234_5678,
            },
        ];
        let app = router(Arc::new(cfg));

        let resp = app
            .oneshot(
                AxRequest::builder()
                    .uri("/api/v1/check-update?current_version=V7.0.8&device_type=ESP32S3_X4_TL_SSD1677&device_id=11226248&lng=en&ota_type=0")
                    .header(header::HOST, "api-prod.xteink.cc")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(v["code"], 0);
        let data = &v["data"];
        assert_eq!(data["version"], "V99.9.9");
        assert_eq!(data["ota_format"], "encrypted_v1");
        // ota_type is echoed as a JSON number (matches the real server), not a string.
        assert_eq!(data["ota_type"], 0);
        assert_eq!(data["force_update"], true);
        assert_eq!(data["size"], TEST_FIRMWARE_SIZE);
        assert_eq!(data["plain_size"], 518_560);
        assert_eq!(data["plain_sha256"], "cd".repeat(32));
        // checksum.sha256 mirrors plain_sha256 (device verifies the decrypted
        // image), and crc32 is null — exactly like the real check-update.
        assert_eq!(data["checksum"]["sha256"], "cd".repeat(32));
        assert!(data["checksum"]["crc32"].is_null());
        let url = data["download_url"].as_str().unwrap();
        assert!(url.starts_with("http://192.168.137.1/firmware/V99.9.9-X4Pro-EN-OTA0-PROD-"));
        assert!(url.ends_with(".xota"));
    }

    /// Ground-truth wire check for the X4 Pro `.xota` download: the device's OTA
    /// driver rejects with `-104` ("content length invalid"), so the response
    /// must carry exactly one `Content-Length` equal to the served size, with no
    /// `Transfer-Encoding: chunked`. Reads the raw HTTP response off a socket
    /// rather than through a client that would normalize the framing.
    #[tokio::test]
    async fn x4pro_firmware_response_is_identity_with_single_content_length() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let path = std::env::temp_dir().join(format!(
            "x4pro-wire-test-{}-{}.xota",
            std::process::id(),
            TEST_FIRMWARE_SIZE
        ));
        let bytes = vec![0x11u8; 4096];
        std::fs::write(&path, &bytes).unwrap();
        let sha = hex::encode(Sha256::digest(&bytes));

        let mut cfg = (*test_config(false)).clone();
        cfg.model = Model::X4Pro;
        cfg.firmware_path = path.clone();
        cfg.firmware_size = bytes.len() as u64;
        cfg.firmware_sha256 = sha;
        cfg.xota_variants = vec![XotaOta {
            ota_type: 1,
            firmware_path: path.to_string_lossy().into_owned(),
            firmware_size: bytes.len() as u64,
            firmware_sha256: cfg.firmware_sha256.clone(),
            plain_size: 4000,
            plain_sha256: "00".repeat(32),
            xota_crc32: 0,
        }];
        let app = router(Arc::new(cfg));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app.into_make_service())
                .await
                .unwrap();
        });

        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream
            .write_all(b"GET /firmware/test-OTA1-file.xota HTTP/1.1\r\nHost: 192.168.2.1\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        std::fs::remove_file(&path).ok();

        let text = String::from_utf8_lossy(&buf);
        let raw_head = text.split("\r\n\r\n").next().unwrap().to_string();
        eprintln!("--- RAW response head (verbatim case) ---\n{raw_head}\n---------------------");
        let head = raw_head.to_lowercase();

        assert_eq!(
            head.matches("content-length:").count(),
            1,
            "exactly one Content-Length required; head:\n{head}"
        );
        assert!(
            head.contains("content-length: 4096"),
            "Content-Length must equal served .xota size; head:\n{head}"
        );
        assert!(
            !head.contains("transfer-encoding"),
            "must be identity framing, not chunked; head:\n{head}"
        );
        assert!(head.contains("connection: close"), "head:\n{head}");
        // The whole body must arrive (head + 4096 bytes).
        assert_eq!(buf.len(), text.find("\r\n\r\n").unwrap() + 4 + 4096);
    }

    /// Proves the `title_case_headers` server tuning added in `start()` actually
    /// puts `Content-Length` (not hyper's default lowercase) on the wire — the
    /// fix for the X4 Pro OTA driver's case-sensitive `-104` rejection. Serves
    /// the real firmware route through the same `axum_server` + http1 builder
    /// pipeline `start()` uses, then reads the raw response head off a socket.
    #[tokio::test]
    async fn firmware_headers_are_title_case_on_the_wire() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let path =
            std::env::temp_dir().join(format!("x4pro-case-test-{}.xota", std::process::id()));
        let bytes = vec![0x22u8; 2048];
        std::fs::write(&path, &bytes).unwrap();
        let sha = hex::encode(Sha256::digest(&bytes));
        let mut cfg = (*test_config(false)).clone();
        cfg.model = Model::X4Pro;
        cfg.firmware_path = path.clone();
        cfg.firmware_size = bytes.len() as u64;
        cfg.firmware_sha256 = sha;
        cfg.xota_variants = vec![XotaOta {
            ota_type: 1,
            firmware_path: path.to_string_lossy().into_owned(),
            firmware_size: bytes.len() as u64,
            firmware_sha256: cfg.firmware_sha256.clone(),
            plain_size: 2000,
            plain_sha256: "00".repeat(32),
            xota_crc32: 0,
        }];
        let app = router(Arc::new(cfg));

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = axum_server::Handle::new();
        // Same tuning as start(): Title-Case header names.
        let mut server = axum_server::from_tcp(listener).unwrap();
        server
            .http_builder()
            .http1()
            .title_case_headers(true)
            .preserve_header_case(true);
        // Route through the same head-logging acceptor start() uses, to confirm
        // the stream wrapper serves headers + body intact.
        let server = server
            .acceptor(HttpHeadLoggingAcceptor)
            .handle(handle.clone());
        let h = handle.clone();
        tokio::spawn(async move { server.serve(app.into_make_service()).await.unwrap() });
        handle.listening().await;
        let _ = h;

        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream
            .write_all(b"GET /firmware/test-OTA1-file.xota HTTP/1.1\r\nHost: 192.168.2.1\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        std::fs::remove_file(&path).ok();

        let text = String::from_utf8_lossy(&buf);
        let head = text.split("\r\n\r\n").next().unwrap().to_string();
        eprintln!(
            "--- wire head (title-case check) ---\n{head}\n------------------------------------"
        );
        // Exact, case-sensitive: the OTA driver looks for "Content-Length".
        assert!(
            head.contains("Content-Length: 2048"),
            "expected Title-Case `Content-Length`; head:\n{head}"
        );
        assert!(
            !head.contains("content-length:"),
            "must not emit lowercase content-length; head:\n{head}"
        );
    }

    #[test]
    fn biscuit_detection_does_not_change_other_repo_manifests() {
        let cfg = test_config(false);

        let biscuit = build_release(&cfg, "biscuit");
        assert_eq!(asset_urls(&biscuit), vec![BISCUIT_FIRMWARE_URL]);

        let crosspoint = build_release(&cfg, "crosspoint-reader");
        assert_eq!(crosspoint["tag_name"], "99.9.9");
        assert_eq!(
            asset_urls(&crosspoint),
            vec!["http://unlocker.crosspointreader.com/firmware/firmware.bin"]
        );
        assert_eq!(crosspoint["assets"][0]["name"], "firmware.bin");

        let inx = build_release(&cfg, "inx");
        assert_eq!(
            asset_urls(&inx),
            vec!["https://unlocker.crosspointreader.com/firmware/firmware.bin"]
        );

        let crosspet = build_release(&cfg, "crosspet");
        assert_eq!(
            asset_urls(&crosspet),
            vec!["https://unlocker.crosspointreader.com/firmware/firmware.bin"]
        );
        let crosspet_http = build_release(&test_config(true), "crosspet");
        assert_eq!(
            asset_urls(&crosspet_http),
            vec!["http://unlocker.crosspointreader.com/firmware/firmware.bin"]
        );

        let crossink = build_release(&cfg, "crossink");
        let crossink_assets = crossink["assets"].as_array().unwrap();
        assert_eq!(crossink_assets.len(), 3);
        assert_eq!(
            crossink_assets[0]["name"],
            "firmware-no_emoji-v99.9.9.1.bin"
        );
        assert!(asset_urls(&crossink)
            .iter()
            .all(|url| url.starts_with("http://")));

        let similarly_named_repo = build_release(&cfg, "biscuit-next");
        assert_eq!(
            asset_urls(&similarly_named_repo),
            vec!["http://unlocker.crosspointreader.com/firmware/firmware.bin"]
        );
    }

    #[test]
    fn esp32c3_image_chip_id_is_five() {
        assert_eq!(esp_chip_name(0x0005), Some("ESP32-C3"));
        assert_eq!(esp_chip_name(0x0009), Some("ESP32-S3"));
        assert_eq!(esp_chip_name(0x0006), None);
    }
}
