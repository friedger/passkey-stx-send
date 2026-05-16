import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  derToRawSignature,
  coseToCompressedPublicKey,
  splitClientData,
} from '@/lib/webauthn';

// --- helpers -----------------------------------------------------------------

/** Decode a base64url string (no padding) back to bytes. */
function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + '='.repeat(pad));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Build a minimal ASN.1 DER ECDSA signature from r and s integer bytes. */
function makeDer(r: number[], s: number[]): Uint8Array {
  const intOf = (b: number[]) => [0x02, b.length, ...b];
  const content = [...intOf(r), ...intOf(s)];
  return new Uint8Array([0x30, content.length, ...content]);
}

/** Build a COSE_Key (CBOR) EC2 public key from 32-byte x and y coordinates. */
function makeCose(x: Uint8Array, y: Uint8Array): Uint8Array {
  return new Uint8Array([
    0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, // map(5): kty, alg, crv
    0x21, 0x58, 0x20, ...x, // -2 (x): byte string of 32
    0x22, 0x58, 0x20, ...y, // -3 (y): byte string of 32
  ]);
}

// --- base64urlEncode ---------------------------------------------------------

describe('base64urlEncode', () => {
  it('encodes empty input to an empty string', () => {
    expect(base64urlEncode(new Uint8Array([]))).toBe('');
  });

  it('matches known vectors', () => {
    expect(base64urlEncode(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(base64urlEncode(new Uint8Array([0xff, 0xff, 0xff]))).toBe('____');
  });

  it('omits padding', () => {
    expect(base64urlEncode(new Uint8Array([0]))).toBe('AA');
    expect(base64urlEncode(new Uint8Array([0, 0]))).toBe('AAA');
  });

  it('uses the url-safe alphabet (- and _ instead of + and /)', () => {
    // 0xf8 -> first sextet 62 ('+' -> '-'); 0xfc -> 63 ('/' -> '_')
    expect(base64urlEncode(new Uint8Array([0xf8, 0, 0]))).toBe('-AAA');
    expect(base64urlEncode(new Uint8Array([0xfc, 0, 0]))).toBe('_AAA');
  });

  it('encodes a 32-byte challenge to 43 chars and round-trips', () => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const encoded = base64urlEncode(challenge);
    expect(encoded).toHaveLength(43);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64urlDecode(encoded)).toEqual(challenge);
  });
});

// --- derToRawSignature -------------------------------------------------------

describe('derToRawSignature', () => {
  it('extracts raw r||s from a 32+32 byte signature', () => {
    const r = new Array(32).fill(0x11);
    const s = new Array(32).fill(0x22);
    const raw = derToRawSignature(makeDer(r, s));
    expect(raw).toHaveLength(64);
    expect(Array.from(raw.slice(0, 32))).toEqual(r);
    expect(Array.from(raw.slice(32, 64))).toEqual(s);
  });

  it('strips the DER leading zero added for a high-bit integer', () => {
    // r is 33 bytes: 0x00 padding + 32 significant bytes starting with 0x80
    const r = [0x00, 0x80, ...new Array(31).fill(0x01)];
    const s = new Array(32).fill(0x09);
    const raw = derToRawSignature(makeDer(r, s));
    expect(raw).toHaveLength(64);
    expect(raw[0]).toBe(0x80);
    expect(raw[1]).toBe(0x01);
  });

  it('left-pads a short integer to 32 bytes', () => {
    const r = [0x05, ...new Array(30).fill(0x07)]; // 31 bytes
    const s = new Array(32).fill(0x03);
    const raw = derToRawSignature(makeDer(r, s));
    expect(raw[0]).toBe(0x00);
    expect(raw[1]).toBe(0x05);
    expect(Array.from(raw.slice(32, 64))).toEqual(s);
  });

  it('throws on a non-DER input', () => {
    expect(() => derToRawSignature(new Uint8Array([0x02, 0x01, 0x00]))).toThrow();
  });
});

// --- coseToCompressedPublicKey ----------------------------------------------

describe('coseToCompressedPublicKey', () => {
  const x = Uint8Array.from({ length: 32 }, (_, i) => i);

  it('compresses with prefix 0x02 when y is even', () => {
    const y = new Uint8Array(32).fill(0xab);
    y[31] = 0x10; // even
    const compressed = coseToCompressedPublicKey(makeCose(x, y));
    expect(compressed).toHaveLength(33);
    expect(compressed[0]).toBe(0x02);
    expect(Array.from(compressed.slice(1))).toEqual(Array.from(x));
  });

  it('compresses with prefix 0x03 when y is odd', () => {
    const y = new Uint8Array(32).fill(0xab);
    y[31] = 0x11; // odd
    const compressed = coseToCompressedPublicKey(makeCose(x, y));
    expect(compressed[0]).toBe(0x03);
  });

  it('throws when the key coordinates are missing', () => {
    expect(() => coseToCompressedPublicKey(new Uint8Array([0xa5, 0x01, 0x02]))).toThrow();
  });
});

// --- splitClientData ---------------------------------------------------------

describe('splitClientData', () => {
  const prefixStr = '{"type":"webauthn.get","challenge":"';
  const suffixStr = '","origin":"https://example.com","crossOrigin":false}';

  it('splits clientDataJSON around the base64url challenge', () => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const json = prefixStr + base64urlEncode(challenge) + suffixStr;
    const { prefix, suffix } = splitClientData(new TextEncoder().encode(json), challenge);

    const decoder = new TextDecoder();
    expect(decoder.decode(prefix)).toBe(prefixStr);
    expect(decoder.decode(suffix)).toBe(suffixStr);

    // the contract reconstructs json as prefix || base64url(challenge) || suffix
    const reconstructed =
      decoder.decode(prefix) + base64urlEncode(challenge) + decoder.decode(suffix);
    expect(reconstructed).toBe(json);
  });

  it('throws when the challenge is not present in clientDataJSON', () => {
    const json = prefixStr + base64urlEncode(new Uint8Array(32).fill(1)) + suffixStr;
    const otherChallenge = new Uint8Array(32).fill(2);
    expect(() =>
      splitClientData(new TextEncoder().encode(json), otherChallenge)
    ).toThrow();
  });
});
