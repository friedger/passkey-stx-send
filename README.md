# Passkey Signing on Stacks

This app lets a user authorize a token transfer with a **WebAuthn passkey** (Face ID,
Touch ID, Windows Hello, a security key) instead of a traditional Stacks wallet. This
document explains how passkey signing is wired up here and why it works the way it does.

## TL;DR

A passkey produces a **P-256 (secp256r1)** ECDSA signature. Stacks transactions are
authorized with **secp256k1**. The two curves are not interchangeable, so a passkey
**cannot sign a Stacks transaction directly**.

Instead, this app uses a **relayer pattern**:

1. The passkey signs a structured *intent* message (recipient, amount, memo) — not a transaction.
2. A server-side relayer holds an ordinary Stacks key, builds the real transaction, pays
   the fee, and broadcasts it.
3. The passkey signature is carried into the contract call so the target contract can
   verify it on-chain.

The user's passkey never holds STX and never pays gas; it only proves consent.

## Roles

| Piece | Curve / role |
|---|---|
| Passkey (WebAuthn credential) | secp256r1 — signs the intent message |
| Relayer key (`STX_PRIVATE_KEY`, in the Edge Function) | secp256k1 — signs & funds the actual transaction |
| Target Clarity contract | verifies the passkey signature against the message |

## End-to-end flow

```
PasskeyAuth.tsx          not-token-service.ts / sip-018.ts        submit-not-transfer (Edge Function)
─────────────────        ─────────────────────────────────       ───────────────────────────────────
create / select   ──▶    resolve BNS name                  
  passkey                build SIP-018 intent message       
                         challenge = sha256(message)        
                         navigator.credentials.get(...)  ──▶  build Clarity contract call
                         → signature + public key            sign with relayer secp256k1 key
                                                              broadcast to Stacks mainnet
                                                         ◀──  txId
```

### 1. Register / select a passkey — `src/components/PasskeyAuth.tsx`

`navigator.credentials.create()` mints a credential, requesting **ES256 (-7)** and
falling back to **RS256 (-257)**. The credential's `rawId` is base64-encoded and kept in
`localStorage` (`stx-passkey-id`), with the username under `stx-passkey-user`. There is
no account server — "logged in" simply means those keys are present.

The `rp.id` is derived from the hostname and normalized: `127.0.0.1`, `::1`, or anything
with a port collapses to `localhost`. Creation and signing **must** use the identical
`rp.id` or the authenticator silently refuses the credential.

### 2. Build the intent message — `src/lib/sip-018.ts`

The transfer is described as a Clarity tuple and hashed with **SIP-018** (Stacks signed
structured data):

```
hash = sha256( "SIP018" ‖ sha256(domainTuple) ‖ sha256(messageTuple) )
```

- `domainTuple` — `{ name: "Clarity Smart Contract", version: "1.0.0", chain-id: 1 }`
- `messageTuple` — `{ topic: "not-transfer", recipient, amount, memo }`

Using SIP-018 means the signed payload is a domain-separated, replay-resistant commitment
to *this* transfer on *this* chain — not an opaque blob.

### 3. Sign with the passkey — `signWithPasskey` in `src/lib/not-token-service.ts`

The SIP-018 hash is hashed once more (`challenge = sha256(message)`) and passed as the
WebAuthn challenge to `navigator.credentials.get()`, scoped to the stored credential id.

What the authenticator actually signs is **not** the challenge directly. WebAuthn signs:

```
signature = ECDSA_P256( authenticatorData ‖ sha256(clientDataJSON) )
```

where `clientDataJSON` embeds the challenge, the origin, and the request type. To verify
such a signature on-chain a contract needs **four** inputs: `authenticatorData`,
`clientDataJSON`, the `signature`, and the **public key**.

`extractPublicKeyFromAuthenticatorData()` parses the COSE-encoded public key out of the
attestation/authenticator data (skipping the RP-ID hash, flags, sign count, AAGUID and
credential id) so it can be carried alongside the signature.

### 4. Relay and broadcast — `supabase/functions/submit-not-transfer/index.ts`

The browser cannot broadcast (it has no secp256k1 key and no STX). It POSTs the recipient,
amount, memo, message, and signature to the `submit-not-transfer` Supabase Edge Function,
which:

- builds a Clarity contract call (contract/function from `NOT_CONTRACT_*` env vars),
- signs it with the relayer key `STX_PRIVATE_KEY`,
- broadcasts to **mainnet** and returns the `txId`.

`supabase/config.toml` sets `verify_jwt = false`, so this endpoint is public — anything
gating abuse must live in the contract or the function body.

## Why this design

- **Passkeys are hardware-bound and phishing-resistant.** The private key never leaves the
  secure enclave, so user consent is strong without seed phrases.
- **Curve mismatch is unavoidable.** secp256r1 ≠ secp256k1, so on-chain *authorization*
  has to come from a relayer; the passkey provides on-chain *verification* instead.
- **SIP-018 keeps intent legible and bound.** The signature commits to exact transfer
  details and the chain id, limiting replay and cross-context misuse.

## Implementation status & caveats

This is a work-in-progress demo. Known gaps for anyone building on it:

- **Verifier inputs are incomplete.** Step 4 forwards only `message` and `signature`. A
  P-256 verifier also needs `authenticatorData`, `clientDataJSON`, and the public key —
  the public key is extracted but currently dropped before submission.
- **Signature encoding.** `signWithPasskey` returns a hex string; the Edge Function wraps
  it with `bufferCVFromString`, which stores the hex *characters* rather than the raw
  signature bytes. Encoding/decoding across this boundary is under active change (see
  recent commits) — verify it end-to-end before relying on it.
- **DER vs. raw.** WebAuthn ES256 signatures are ASN.1 DER-encoded `(r, s)`. Most on-chain
  verifiers expect a raw 64-byte `r‖s`; conversion is not yet done here.
- **Mainnet only.** The UI hardcodes mainnet; `not-token-service.ts` has testnet plumbing
  that the UI never exercises.

## Project layout

| Path | Responsibility |
|---|---|
| `src/components/PasskeyAuth.tsx` | Passkey registration / selection |
| `src/components/NothingTransfer.tsx` | Transfer form UI |
| `src/lib/sip-018.ts` | SIP-018 structured-data hashing |
| `src/lib/not-token-service.ts` | BNS resolution, passkey signing, relayer call |
| `supabase/functions/submit-not-transfer/` | Relayer: builds, signs & broadcasts the tx |

See `CLAUDE.md` for build/test commands and broader architecture, and `TESTING.md` for
the credential-encoding test suite.
