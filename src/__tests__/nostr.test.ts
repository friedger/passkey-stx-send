import { describe, it, expect } from 'vitest';
import {
  deriveNostrKeyFromPrf,
  getNpub,
  buildNothingSentNote,
} from '@/lib/nostr';

describe('deriveNostrKeyFromPrf', () => {
  it('derives a deterministic 32-byte key from a PRF output', () => {
    const k1 = deriveNostrKeyFromPrf(new Uint8Array(32).fill(7));
    const k2 = deriveNostrKeyFromPrf(new Uint8Array(32).fill(7));
    expect(k1).toHaveLength(32);
    expect(k1).toEqual(k2); // same passkey + salt -> same Nostr identity
  });

  it('derives different keys for different PRF outputs', () => {
    const a = deriveNostrKeyFromPrf(new Uint8Array(32).fill(1));
    const b = deriveNostrKeyFromPrf(new Uint8Array(32).fill(2));
    expect(a).not.toEqual(b);
  });

  it('throws when the PRF output is too short', () => {
    expect(() => deriveNostrKeyFromPrf(new Uint8Array(16))).toThrow();
  });
});

describe('getNpub', () => {
  it('returns a bech32 npub for a derived key', () => {
    const key = deriveNostrKeyFromPrf(new Uint8Array(32).fill(9));
    expect(getNpub(key)).toMatch(/^npub1[0-9a-z]+$/);
  });
});

describe('buildNothingSentNote', () => {
  it('includes the recipient, memo, and explorer link', () => {
    const note = buildNothingSentNote({
      txId: '0xabc123',
      memo: 'happy nothing',
      recipientBnsName: 'lucky.btc',
      network: 'mainnet',
    });
    expect(note).toContain('Nothing was sent');
    expect(note).toContain('lucky.btc');
    expect(note).toContain('happy nothing');
    expect(note).toContain(
      'https://explorer.hiro.so/txid/0xabc123?chain=mainnet'
    );
  });

  it('omits the memo line when no memo is given', () => {
    const note = buildNothingSentNote({
      txId: '0xdef',
      recipientBnsName: 'nobody.btc',
      network: 'mainnet',
    });
    expect(note).toContain('Nothing was sent to nobody.btc.');
    expect(note).not.toContain('""');
  });
});
