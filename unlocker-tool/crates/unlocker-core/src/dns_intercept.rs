//! Packet-level DNS spoofing for firmwares that bypass the hotspot resolver.
//!
//! Most stock/CrossPoint firmwares use the DNS server the hotspot hands out
//! over DHCP, so the DNS server in [`crate::dns`] (or, on Windows, the ICS DNS
//! proxy + hosts file) answers them. But some builds — notably X4 Pro XTOS
//! V7.6.10 (CN) — ignore the DHCP resolver and send queries straight to a
//! *hardcoded* public resolver (AliDNS `223.5.5.5`). On macOS/Linux our
//! pf/iptables rule redirects *all* outbound UDP/53 regardless of destination,
//! so those are caught transparently. Windows ICS exposes no such redirect, so
//! the helper instead captures the forwarded query at the packet layer (via
//! WinDivert) and hands the raw IPv4 packet here.
//!
//! [`spoof_forwarded_dns`] takes one captured IPv4/UDP/DNS query packet and, if
//! it's a name we spoof, returns a complete IPv4/UDP/DNS *reply* packet to
//! inject back toward the device — source = the resolver the device thought it
//! was talking to, so the device accepts it. `None` means "not ours, let it
//! pass through untouched" (so normal internet DNS keeps working). Keeping the
//! header/checksum arithmetic here (not in the Windows-only glue) lets it be
//! unit-tested on any platform.

use std::net::Ipv4Addr;

/// Build a spoofed DNS reply packet for a captured forwarded query, or `None`
/// if the packet isn't an IPv4/UDP/:53 query for a spoofed name.
///
/// `query_packet` is a full IPv4 packet (starting at the IP header). The reply
/// swaps the IP endpoints and sets the UDP source port to 53, so to the device
/// it looks exactly like the resolver it queried answered.
pub fn spoof_forwarded_dns(
    query_packet: &[u8],
    spoofed_hosts: &[String],
    answer_with: Ipv4Addr,
) -> Option<Vec<u8>> {
    // ── IPv4 header ──
    if query_packet.len() < 20 {
        return None;
    }
    let version = query_packet[0] >> 4;
    let ihl = (query_packet[0] & 0x0f) as usize * 4;
    if version != 4 || ihl < 20 || query_packet.len() < ihl + 8 {
        return None;
    }
    if query_packet[9] != 17 {
        return None; // not UDP
    }
    let src_ip = Ipv4Addr::new(query_packet[12], query_packet[13], query_packet[14], query_packet[15]);
    let dst_ip = Ipv4Addr::new(query_packet[16], query_packet[17], query_packet[18], query_packet[19]);

    // ── UDP header ──
    let udp = &query_packet[ihl..];
    let src_port = u16::from_be_bytes([udp[0], udp[1]]);
    let dst_port = u16::from_be_bytes([udp[2], udp[3]]);
    if dst_port != 53 {
        return None;
    }
    let udp_len = u16::from_be_bytes([udp[4], udp[5]]) as usize;
    if udp_len < 8 || ihl + udp_len > query_packet.len() {
        return None;
    }
    let dns_query = &udp[8..udp_len];

    // Only names we spoof get an answer; everything else passes through.
    let dns_reply = crate::dns::build_spoof_response(dns_query, spoofed_hosts, answer_with)?;

    // ── Assemble the reply: resolver -> device, UDP :53 -> device's src port ──
    Some(build_udp_ipv4(dst_ip, src_ip, 53, src_port, &dns_reply))
}

/// Build a full IPv4/UDP packet with correct header and checksums.
fn build_udp_ipv4(
    src_ip: Ipv4Addr,
    dst_ip: Ipv4Addr,
    src_port: u16,
    dst_port: u16,
    payload: &[u8],
) -> Vec<u8> {
    let udp_len = 8 + payload.len();
    let total_len = 20 + udp_len;
    let mut pkt = vec![0u8; total_len];

    // IPv4 header (20 bytes, no options).
    pkt[0] = 0x45; // version 4, IHL 5
    pkt[1] = 0; // DSCP/ECN
    pkt[2..4].copy_from_slice(&(total_len as u16).to_be_bytes());
    pkt[4..6].copy_from_slice(&0u16.to_be_bytes()); // id
    pkt[6..8].copy_from_slice(&0x4000u16.to_be_bytes()); // flags: don't fragment
    pkt[8] = 64; // TTL
    pkt[9] = 17; // UDP
    // pkt[10..12] checksum, filled below
    pkt[12..16].copy_from_slice(&src_ip.octets());
    pkt[16..20].copy_from_slice(&dst_ip.octets());
    let ip_csum = checksum(&pkt[0..20]);
    pkt[10..12].copy_from_slice(&ip_csum.to_be_bytes());

    // UDP header + payload.
    pkt[20..22].copy_from_slice(&src_port.to_be_bytes());
    pkt[22..24].copy_from_slice(&dst_port.to_be_bytes());
    pkt[24..26].copy_from_slice(&(udp_len as u16).to_be_bytes());
    // pkt[26..28] UDP checksum, filled below
    pkt[28..].copy_from_slice(payload);
    let udp_csum = udp_checksum(src_ip, dst_ip, &pkt[20..]);
    pkt[26..28].copy_from_slice(&udp_csum.to_be_bytes());

    pkt
}

/// Standard one's-complement 16-bit checksum over a byte slice.
fn checksum(data: &[u8]) -> u16 {
    let mut sum = 0u32;
    let mut i = 0;
    while i + 1 < data.len() {
        sum += u16::from_be_bytes([data[i], data[i + 1]]) as u32;
        i += 2;
    }
    if i < data.len() {
        sum += (data[i] as u32) << 8;
    }
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    !(sum as u16)
}

/// UDP checksum over the IPv4 pseudo-header + UDP header/payload.
fn udp_checksum(src_ip: Ipv4Addr, dst_ip: Ipv4Addr, udp: &[u8]) -> u16 {
    let mut sum = 0u32;
    for chunk in [src_ip.octets(), dst_ip.octets()] {
        sum += u16::from_be_bytes([chunk[0], chunk[1]]) as u32;
        sum += u16::from_be_bytes([chunk[2], chunk[3]]) as u32;
    }
    sum += 17u32; // protocol
    sum += udp.len() as u32; // UDP length (again, per pseudo-header)
    let mut i = 0;
    while i + 1 < udp.len() {
        sum += u16::from_be_bytes([udp[i], udp[i + 1]]) as u32;
        i += 2;
    }
    if i < udp.len() {
        sum += (udp[i] as u32) << 8;
    }
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    let csum = !(sum as u16);
    // A computed 0 is transmitted as 0xffff (0 means "no checksum" in UDP).
    if csum == 0 {
        0xffff
    } else {
        csum
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hickory_proto::op::{Message, MessageType, OpCode, Query};
    use hickory_proto::rr::{Name, RData, RecordType};
    use std::str::FromStr;

    /// Hand-assemble an IPv4/UDP/DNS query packet: device -> resolver:53.
    fn query_packet(device: Ipv4Addr, resolver: Ipv4Addr, src_port: u16, name: &str) -> Vec<u8> {
        let mut m = Message::new(0xbeef, MessageType::Query, OpCode::Query);
        let mut q = Query::new();
        q.set_name(Name::from_str(name).unwrap()).set_query_type(RecordType::A);
        m.queries.push(q);
        super::build_udp_ipv4(device, resolver, src_port, 53, &m.to_vec().unwrap())
    }

    #[test]
    fn spoofs_hardcoded_resolver_query_and_reverses_endpoints() {
        let device = Ipv4Addr::new(192, 168, 137, 28);
        let resolver = Ipv4Addr::new(223, 5, 5, 5); // AliDNS, hardcoded by XTOS
        let bridge = Ipv4Addr::new(192, 168, 137, 1);
        let hosts = vec!["api-prod.xteink.cn".to_string()];

        let query = query_packet(device, resolver, 54321, "api-prod.xteink.cn");
        let reply = spoof_forwarded_dns(&query, &hosts, bridge).expect("spoofed name → a reply");

        // IP endpoints reversed: reply comes FROM the resolver the device asked.
        assert_eq!(&reply[12..16], &resolver.octets(), "reply src = resolver");
        assert_eq!(&reply[16..20], &device.octets(), "reply dst = device");
        // UDP source port is 53; dst is the device's original source port.
        assert_eq!(u16::from_be_bytes([reply[20], reply[21]]), 53);
        assert_eq!(u16::from_be_bytes([reply[22], reply[23]]), 54321);
        // Checksums verify (whole-packet one's-complement sums to 0).
        assert_eq!(checksum(&reply[0..20]), 0, "IPv4 header checksum must verify");

        // The DNS payload answers with the bridge IP.
        let ihl = (reply[0] & 0x0f) as usize * 4;
        let dns = Message::from_vec(&reply[ihl + 8..]).unwrap();
        match dns.answers.first().map(|r| &r.data) {
            Some(RData::A(a)) => assert_eq!(a.0, bridge),
            other => panic!("expected A={bridge}, got {other:?}"),
        }
    }

    #[test]
    fn passes_through_unspoofed_and_malformed() {
        let hosts = vec!["api-prod.xteink.cn".to_string()];
        let bridge = Ipv4Addr::new(192, 168, 137, 1);
        let device = Ipv4Addr::new(192, 168, 137, 28);
        let resolver = Ipv4Addr::new(223, 5, 5, 5);

        // A real DNS query for a name we don't spoof → pass through.
        let q = query_packet(device, resolver, 40000, "example.com");
        assert!(spoof_forwarded_dns(&q, &hosts, bridge).is_none());
        // Too short / not IPv4 → None, never a panic.
        assert!(spoof_forwarded_dns(&[0x45, 0, 0], &hosts, bridge).is_none());
        assert!(spoof_forwarded_dns(&[0x60; 40], &hosts, bridge).is_none()); // IPv6 nibble
    }
}
