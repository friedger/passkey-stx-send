/**
 * Nostr integration following the Breez passkey-login scheme
 * (https://github.com/breez/passkey-login): a WebAuthn PRF output is turned
 * into a BIP39 mnemonic, then a NIP-06 Nostr key (m/44'/1237'/0'/0/0).
 *
 * The same passkey + salt always yields the same Nostr identity, so no seed
 * phrase or server-side state is needed.
 */
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { npubEncode, noteEncode } from "nostr-tools/nip19";
import { privateKeyFromSeedWords } from "nostr-tools/nip06";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** Relays the "nothing was sent" note is published to. */
export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

/**
 * PRF salt. Per the Breez passkey-login spec the salt string is used directly
 * (no extra random text), keeping the derived identity stable and reproducible.
 */
export const NOSTR_PRF_SALT = "send-nothing";

/** PRF eval input for the WebAuthn `get()` call. */
export function nostrPrfSalt(): Uint8Array {
  return new TextEncoder().encode(NOSTR_PRF_SALT);
}

/**
 * Derive a Nostr secret key from a WebAuthn PRF output: the 32-byte PRF result
 * becomes BIP39 entropy, and the mnemonic is run through NIP-06 derivation.
 */
export function deriveNostrKeyFromPrf(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length < 32) {
    throw new Error("PRF output too short to derive a Nostr key");
  }
  const mnemonic = entropyToMnemonic(prfOutput.slice(0, 32), wordlist);
  return privateKeyFromSeedWords(mnemonic); // m/44'/1237'/0'/0/0
}

/** bech32 `npub` for a secret key. */
export function getNpub(secretKey: Uint8Array): string {
  return npubEncode(getPublicKey(secretKey));
}

/** Build the note content announcing that Nothing was sent. */
export function buildNothingSentNote(params: {
  txId: string;
  memo?: string;
  recipientBnsName: string;
  network: string;
}): string {
  const explorer = `https://explorer.hiro.so/txid/${params.txId}?chain=${params.network}`;
  const lines = [`🪙 Nothing was sent to ${params.recipientBnsName}.`];
  if (params.memo && params.memo.trim()) {
    lines.push("", `"${params.memo.trim()}"`);
  }
  lines.push("", `Proof of Nothing: ${explorer}`);
  return lines.join("\n");
}

/** Publish a kind-1 text note; resolves once at least one relay accepts it. */
export async function postNote(
  secretKey: Uint8Array,
  content: string,
  relays: string[] = NOSTR_RELAYS
): Promise<{ eventId: string; noteUri: string }> {
  const event = finalizeEvent(
    { kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content },
    secretKey
  );

  const pool = new SimplePool();
  try {
    const results = await Promise.allSettled(pool.publish(relays, event));
    if (!results.some((r) => r.status === "fulfilled")) {
      throw new Error("No relay accepted the note");
    }
    return {
      eventId: event.id,
      noteUri: `https://njump.me/${noteEncode(event.id)}`,
    };
  } finally {
    pool.close(relays);
  }
}
