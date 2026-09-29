#!/usr/bin/env bash
# Validate a DigiCert-rooted cert and install it as the bundled HTTPS cert.
#
# Why this exists: X4 Pro stock >= V7.6.8 dropped ESP-IDF's Mozilla CA bundle and
# now trusts only a DigiCert-anchored CA (issue #44). It still does chain-only
# validation with NO hostname check (no SNI in its ClientHello), so a *genuine*
# DigiCert-rooted cert for a domain we control is accepted -- but only if the
# served chain actually builds to DigiCert Global Root G2. The classic failures
# (leaf without intermediate, wrong order, key/cert mismatch, non-DigiCert root)
# all produce the SAME silent on-device BadCertificate, so validate here first.
#
# Buy a RapidSSL DV cert (DigiCert reseller) for unlocker.crosspointreader.com:
# its chain is RapidSSL TLS RSA CA G1 -> DigiCert Global Root G2, matching the
# real api-prod.xteink.cc -- which also covers the case they pinned the
# intermediate rather than the root.
#
# Usage:
#   ./install-cert.sh --check  <leaf.crt> <intermediate.crt> <privkey.key>
#   ./install-cert.sh --install <leaf.crt> <intermediate.crt> <privkey.key>
#
# --check validates only. --install validates then writes fullchain.pem +
# privkey.pem in place. Rebuild after installing: `cargo build --workspace`.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
EXPECTED_ROOT="DigiCert Global Root G2"
EXPECTED_SAN="unlocker.crosspointreader.com"

mode="${1:-}"; leaf="${2:-}"; inter="${3:-}"; key="${4:-}"
if [[ "$mode" != "--check" && "$mode" != "--install" ]] || [[ -z "$leaf" || -z "$inter" || -z "$key" ]]; then
  sed -n '2,30p' "$0"; exit 2
fi
for f in "$leaf" "$inter" "$key"; do [[ -r "$f" ]] || { echo "FAIL: cannot read $f"; exit 1; }; done

fail=0
note() { echo "  $*"; }
bad()  { echo "FAIL: $*"; fail=1; }

# 1. Key matches leaf (SPKI compare -- works for RSA and EC).
lk="$(openssl x509 -in "$leaf" -noout -pubkey | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256)"
kk="$(openssl pkey -in "$key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)"
[[ "$lk" == "$kk" ]] && note "key matches leaf cert" || bad "private key does not match leaf cert"

# 2. Leaf covers the SAN we serve.
sans="$(openssl x509 -in "$leaf" -noout -ext subjectAltName 2>/dev/null || true)"
echo "$sans" | grep -q "DNS:$EXPECTED_SAN" && note "leaf SAN covers $EXPECTED_SAN" \
  || bad "leaf SAN is missing DNS:$EXPECTED_SAN (got: ${sans//$'\n'/ })"

# 3. Leaf not expired (device clock is NTP-spoofed to real time).
openssl x509 -in "$leaf" -noout -checkend 0 >/dev/null 2>&1 && note "leaf not expired" \
  || bad "leaf cert is expired"

# 4. Chain links: leaf issuer == intermediate subject.
li="$(openssl x509 -in "$leaf" -noout -issuer)"
is="$(openssl x509 -in "$inter" -noout -subject)"
[[ "${li#issuer=}" == "${is#subject=}" ]] && note "leaf chains to the supplied intermediate" \
  || bad "leaf issuer != intermediate subject (leaf: ${li#issuer=} / inter: ${is#subject=})"

# 5. The TOP of our chain is issued BY the DigiCert root the device trusts. We
#    do not ship the root (the device holds it); we only need our topmost cert
#    to point at it. Read the LAST cert in $inter (which may be a multi-cert
#    bundle) -- if that one is still issued by an intermediate, the chain is
#    incomplete: append the missing intermediate to $inter and re-run.
top="$(awk 'BEGIN{n=0} /BEGIN CERT/{n++} {c[n]=c[n]$0"\n"} END{printf "%s",c[n]}' "$inter")"
ii="$(echo "$top" | openssl x509 -noout -issuer)"
echo "${ii#issuer=}" | grep -q "$EXPECTED_ROOT" && note "intermediate is issued by $EXPECTED_ROOT" \
  || bad "top intermediate is issued by '${ii#issuer=}', not '$EXPECTED_ROOT' -- wrong CA or a missing intermediate. Free CAs (Let's Encrypt/ZeroSSL/Google/Sectigo) will trip this; you need a DigiCert-family (RapidSSL/GeoTrust/Thawte) cert."

if [[ $fail -ne 0 ]]; then echo "VALIDATION FAILED -- not installing."; exit 1; fi
echo "OK: chain validates to $EXPECTED_ROOT."

if [[ "$mode" == "--install" ]]; then
  # fullchain.pem = leaf THEN intermediate(s), never the root. Use `awk 1`
  # rather than `cat`: it guarantees a newline after each file's last line, so
  # a source .crt without a trailing newline can't glue `-----END-----` onto the
  # next `-----BEGIN-----` and corrupt the PEM.
  awk 1 "$leaf" "$inter" > "$DIR/fullchain.pem"
  cp "$key" "$DIR/privkey.pem"
  # Sanity-check the assembled file actually parses as the two certs we expect.
  n=$(openssl crl2pkcs7 -nocrl -certfile "$DIR/fullchain.pem" 2>/dev/null \
      | openssl pkcs7 -print_certs -noout 2>/dev/null | grep -c "subject=")
  if [[ "$n" -ne 2 ]]; then
    bad "assembled fullchain.pem parsed to $n certs, expected 2 (leaf + intermediate)"
    echo "VALIDATION FAILED after write."; exit 1
  fi
  echo "Installed fullchain.pem + privkey.pem ($n certs). Now rebuild: cargo build --workspace"
fi
