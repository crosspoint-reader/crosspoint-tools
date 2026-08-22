//! Spoofing DNS server.

use crate::types::Locale;
use anyhow::{anyhow, Result};
use hickory_proto::op::{Message, MessageType, OpCode, ResponseCode};
use hickory_proto::rr::{rdata, RData, Record, RecordType};
use hickory_resolver::config::{ResolverConfig, ResolverOpts, CLOUDFLARE};
use hickory_resolver::net::runtime::TokioRuntimeProvider;
use hickory_resolver::TokioResolver;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tokio::net::UdpSocket;

#[derive(Debug, Clone)]
pub struct DnsConfig {
    pub bind_ip: IpAddr,
    pub port: u16,
    pub spoofed_hosts: Vec<String>,
    pub answer_with: Ipv4Addr,
}

impl DnsConfig {
    pub fn for_locale(locale: Locale, bridge_ip: Ipv4Addr, port: u16) -> Self {
        Self {
            bind_ip: IpAddr::V4(bridge_ip),
            port,
            spoofed_hosts: vec![
                locale.api_host().to_string(),
                // CrossPoint OTA checks api.github.com for updates.
                "api.github.com".to_string(),
                // Firmware download URL uses our cert's hostname.
                "unlocker.crosspointreader.com".to_string(),
                // CPR-vCodex fork hosts its OTA manifest on GitHub Pages.
                // Its esp_http_client sets `skip_cert_common_name_check=true`,
                // so the bundled LE cert (CN=unlocker.crosspointreader.com)
                // still passes TLS as long as the chain validates.
                "franssjz.github.io".to_string(),
                // NTP time-sync hosts. Stock firmwares (e.g. the X4 Pro) sync
                // their clock before checking for updates; on this isolated
                // hotspot there's no real internet, so we point these at the
                // bridge IP and answer them with our own SNTP responder (see
                // `ntp.rs`). Without this the device spins forever on NTP and
                // never reaches check-update. `pool.ntp.org` subdomains
                // (0/1/2/3.pool.ntp.org, country pools) are matched by suffix
                // in `is_spoofed`.
                "pool.ntp.org".to_string(),
                "time.google.com".to_string(),
                "time.apple.com".to_string(),
                "time.windows.com".to_string(),
                "time.cloudflare.com".to_string(),
                "time.nist.gov".to_string(),
                // The X4 Pro *factory* app (app0, V0.0.7) syncs against a
                // different NTP set than the main app (which uses pool.ntp.org):
                // ntp{N}.aliyun.com, ntp.ntsc.ac.cn, time{N}.apple.com,
                // time{N}.google.com. Without these the factory device can't get
                // a clock on the internet-less hotspot and stalls before / during
                // OTA. The `ntp*.aliyun.com` and `time{N}.{apple,google}.com`
                // families are matched by pattern in `is_spoofed`; the exact
                // hosts below are listed for clarity and startup logging.
                "ntp.ntsc.ac.cn".to_string(),
                "ntp1.aliyun.com".to_string(),
                "ntp2.aliyun.com".to_string(),
                "time1.apple.com".to_string(),
                "time1.google.com".to_string(),
            ],
            answer_with: bridge_ip,
        }
    }
}

pub struct DnsHandle {
    shutdown: tokio::sync::oneshot::Sender<()>,
    pub join: tokio::task::JoinHandle<()>,
}

impl DnsHandle {
    pub async fn shutdown(self) {
        let _ = self.shutdown.send(());
        let _ = self.join.await;
    }
}

pub async fn start(config: DnsConfig) -> Result<DnsHandle> {
    let addr = SocketAddr::new(config.bind_ip, config.port);
    let socket = Arc::new(UdpSocket::bind(addr).await?);
    tracing::info!(?addr, hosts = ?config.spoofed_hosts, "DNS server bound");

    let mut builder = TokioResolver::builder_with_config(
        ResolverConfig::udp_and_tcp(&CLOUDFLARE),
        TokioRuntimeProvider::default(),
    );
    *builder.options_mut() = ResolverOpts::default();
    let resolver = Arc::new(
        builder
            .build()
            .map_err(|e| anyhow!("resolver init failed: {e}"))?,
    );

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    let cfg = Arc::new(config);

    let join = tokio::spawn(async move {
        let mut buf = vec![0u8; 1500];
        loop {
            tokio::select! {
                _ = &mut rx => break,
                res = socket.recv_from(&mut buf) => {
                    match res {
                        Ok((n, src)) => {
                            let bytes = buf[..n].to_vec();
                            let socket = socket.clone();
                            let cfg = cfg.clone();
                            let resolver = resolver.clone();
                            tokio::spawn(async move {
                                if let Err(e) = handle_query(&bytes, src, &socket, &cfg, &resolver).await {
                                    tracing::debug!(?e, "dns handle error");
                                }
                            });
                        }
                        Err(e) => {
                            tracing::warn!(?e, "dns recv error");
                        }
                    }
                }
            }
        }
    });

    Ok(DnsHandle { shutdown: tx, join })
}

/// Whether a queried name should resolve to the bridge IP. Matches the
/// configured hosts exactly, plus any `*.pool.ntp.org` subdomain (the NTP pool
/// hands out numbered and country-specific names like `0.pool.ntp.org` or
/// `us.pool.ntp.org` that we still want to capture for time sync).
fn is_spoofed(qname_norm: &str, spoofed_hosts: &[String]) -> bool {
    spoofed_hosts
        .iter()
        .any(|h| h.eq_ignore_ascii_case(qname_norm))
        || qname_norm.ends_with(".pool.ntp.org")
        // NTP host families the X4 Pro factory app uses (see DnsConfig): any
        // numbered `ntp{N}.aliyun.com` and any `time{N}.apple.com` /
        // `time{N}.google.com`. Scoped to the ntp/time prefixes so we don't
        // hijack unrelated aliyun/google/apple subdomains.
        || (qname_norm.starts_with("ntp") && qname_norm.ends_with(".aliyun.com"))
        || (qname_norm.starts_with("time")
            && (qname_norm.ends_with(".apple.com") || qname_norm.ends_with(".google.com")))
}

#[cfg(test)]
mod tests {
    use super::is_spoofed;

    #[test]
    fn spoofs_x4pro_factory_ntp_hosts() {
        let hosts = vec![
            "api-prod.xteink.cc".to_string(),
            "ntp.ntsc.ac.cn".to_string(),
        ];
        // exact list entry
        assert!(is_spoofed("ntp.ntsc.ac.cn", &hosts));
        // ntp{N}.aliyun.com family (not in the list, matched by pattern)
        assert!(is_spoofed("ntp1.aliyun.com", &hosts));
        assert!(is_spoofed("ntp7.aliyun.com", &hosts));
        // time{N}.apple.com / time{N}.google.com family
        assert!(is_spoofed("time1.apple.com", &hosts));
        assert!(is_spoofed("time.google.com", &hosts));
        // pool.ntp.org numbered subdomains still covered
        assert!(is_spoofed("0.pool.ntp.org", &hosts));
        // must NOT hijack unrelated aliyun/google/apple subdomains
        assert!(!is_spoofed("oss.aliyun.com", &hosts));
        assert!(!is_spoofed("www.google.com", &hosts));
        assert!(!is_spoofed("push.apple.com", &hosts));
    }
}

async fn handle_query(
    bytes: &[u8],
    src: SocketAddr,
    socket: &UdpSocket,
    cfg: &DnsConfig,
    resolver: &TokioResolver,
) -> Result<()> {
    let request = Message::from_vec(bytes)?;
    if request.metadata.message_type != MessageType::Query {
        return Ok(());
    }
    let query = request
        .queries
        .first()
        .ok_or_else(|| anyhow!("no query"))?
        .clone();

    let qname_norm = query
        .name()
        .to_string()
        .trim_end_matches('.')
        .to_lowercase();
    let should_spoof = is_spoofed(&qname_norm, &cfg.spoofed_hosts);

    tracing::info!(
        host = %qname_norm,
        qtype = ?query.query_type(),
        src = %src,
        spoofed = should_spoof,
        "dns query"
    );

    let mut response = Message::new(request.metadata.id, MessageType::Response, OpCode::Query);
    response.metadata.recursion_desired = request.metadata.recursion_desired;
    response.metadata.recursion_available = true;
    response.queries.push(query.clone());

    if should_spoof && query.query_type() == RecordType::A {
        tracing::info!(host = %qname_norm, "spoofing");
        let rec = Record::from_rdata(
            query.name().clone(),
            60,
            RData::A(rdata::A(cfg.answer_with)),
        );
        response.answers.push(rec);
        response.metadata.response_code = ResponseCode::NoError;
    } else {
        match resolver
            .lookup(query.name().clone(), query.query_type())
            .await
        {
            Ok(lookup) => {
                for r in lookup.answers() {
                    response.answers.push(r.clone());
                }
                response.metadata.response_code = ResponseCode::NoError;
            }
            Err(_) => {
                response.metadata.response_code = ResponseCode::ServFail;
            }
        }
    }

    let bytes = response.to_vec()?;
    socket.send_to(&bytes, src).await?;
    Ok(())
}
