import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the Nostr relay pool so the test makes no real WebSocket connections.
vi.mock('nostr-tools/pool', () => ({
  SimplePool: class {
    publish(relays: string[]) {
      return relays.map(() => Promise.resolve('ok'));
    }
    close() {}
  },
}));

import { NotTokenService } from '@/lib/not-token-service';
import { deriveNostrKeyFromPrf } from '@/lib/nostr';

describe('NotTokenService.announceOnNostr', () => {
  const secretKey = deriveNostrKeyFromPrf(new Uint8Array(32).fill(3));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for confirmation, then posts a note to Nostr', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tx_status: 'success' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await NotTokenService.announceOnNostr({
      txId: 'abc123',
      recipientBnsName: 'lucky.btc',
      memo: 'here is nothing',
      network: 'mainnet',
      nostrSecretKey: secretKey,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // confirmation poll
    expect(result.npub).toMatch(/^npub1[0-9a-z]+$/);
    expect(result.noteUri).toMatch(/^https:\/\/njump\.me\/note1[0-9a-z]+$/);
  });

  it('throws (and does not post) when the transaction aborts on-chain', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tx_status: 'abort_by_response' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      NotTokenService.announceOnNostr({
        txId: 'def456',
        recipientBnsName: 'nobody.btc',
        network: 'mainnet',
        nostrSecretKey: secretKey,
      })
    ).rejects.toThrow(/failed on-chain/i);
  });
});
