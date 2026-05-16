/**
 * WebAuthn parsing helpers used to turn a passkey assertion into the inputs
 * the `passkey-not-sender` Clarity contract expects.
 */

/** Base64url-encode bytes (RFC 4648, url-safe alphabet, no padding). */
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Convert an ASN.1 DER-encoded ECDSA signature into the raw 64-byte `r || s`
 * form that `secp256r1-verify` expects. P-256 signatures are always short-form
 * DER: `30 <len> 02 <rLen> <r> 02 <sLen> <s>`.
 */
export function derToRawSignature(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) {
    throw new Error("Invalid DER signature: missing SEQUENCE");
  }
  let offset = 2; // skip SEQUENCE tag + short-form length byte

  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: missing r INTEGER");
  }
  const rLen = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: missing s INTEGER");
  }
  const sLen = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLen);

  const raw = new Uint8Array(64);
  raw.set(toFixed32(r), 0);
  raw.set(toFixed32(s), 32);
  return raw;
}

/** Left-pad (or trim leading zeros from) a DER integer to exactly 32 bytes. */
function toFixed32(int: Uint8Array): Uint8Array {
  let start = 0;
  while (start < int.length - 1 && int[start] === 0x00) start++;
  const trimmed = int.subarray(start);
  if (trimmed.length > 32) {
    throw new Error("Invalid DER integer: longer than 32 bytes");
  }
  const out = new Uint8Array(32);
  out.set(trimmed, 32 - trimmed.length);
  return out;
}

/**
 * Derive the 33-byte compressed P-256 public key from a COSE_Key (CBOR).
 * In a COSE EC2 key the x coordinate is parameter -2 (CBOR map key 0x21) and
 * y is -3 (0x22), each a 32-byte byte string (`58 20` length marker).
 */
export function coseToCompressedPublicKey(cose: Uint8Array): Uint8Array {
  const x = findCoseCoordinate(cose, 0x21);
  const y = findCoseCoordinate(cose, 0x22);
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
  return new Uint8Array([prefix, ...x]);
}

function findCoseCoordinate(buf: Uint8Array, mapKey: number): Uint8Array {
  for (let i = 0; i + 35 <= buf.length; i++) {
    if (buf[i] === mapKey && buf[i + 1] === 0x58 && buf[i + 2] === 0x20) {
      return buf.slice(i + 3, i + 35);
    }
  }
  throw new Error(
    `COSE coordinate 0x${mapKey.toString(16)} not found — not an ES256 key?`
  );
}

/**
 * Split `clientDataJSON` into the bytes before and after the base64url-encoded
 * challenge. The contract reconstructs the JSON as
 * `prefix || base64url(challenge) || suffix`, so it can recompute the challenge
 * from the transfer parameters and reject a forged one.
 */
export function splitClientData(
  clientDataJSON: Uint8Array,
  challenge: Uint8Array
): { prefix: Uint8Array; suffix: Uint8Array } {
  const json = new TextDecoder().decode(clientDataJSON);
  const challengeB64 = base64urlEncode(challenge);
  const index = json.indexOf(challengeB64);
  if (index === -1) {
    throw new Error("Challenge not found in clientDataJSON");
  }
  const encoder = new TextEncoder();
  return {
    prefix: encoder.encode(json.slice(0, index)),
    suffix: encoder.encode(json.slice(index + challengeB64.length)),
  };
}
