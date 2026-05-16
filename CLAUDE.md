# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses `pnpm` (see `TESTING.md`). Multiple lockfiles exist (`pnpm-lock.yaml`, `package-lock.json`, `bun.lockb`) — prefer `pnpm`.

- `pnpm dev` — Vite dev server on port 8080 (`vite.config.ts` sets `host: "::"`)
- `pnpm build` — production build; `pnpm build:dev` builds with development mode
- `pnpm lint` — ESLint (flat config in `eslint.config.js`)
- `pnpm test` — Vitest in watch mode
- `pnpm test -- --run` — run all tests once
- `pnpm test -- --run -t "<name>"` — run a single test by name
- `pnpm test:ui` — Vitest with the UI

Imports use the `@/` alias for `src/` (configured in `vite.config.ts`, `vitest.config.ts`, and `tsconfig`).

## What this app does

"Send Nothing" lets a user send NOT tokens (a Stacks fungible token) to a recipient identified by a BNS name, authorizing the transfer with a WebAuthn passkey instead of a wallet. It is a Lovable-generated project (project URL in `README.md`).

## Architecture

The transfer is a multi-step flow split between the browser and a Supabase Edge Function. The server holds the funding key; the client only authenticates intent.

1. **Passkey auth** (`src/components/PasskeyAuth.tsx`) — Creates or retrieves a WebAuthn credential. The credential `rawId` is base64-encoded and stored in `localStorage` under `stx-passkey-id`; the username under `stx-passkey-user`. There is no real backend account — "logged in" just means these keys exist.

2. **BNS resolution** (`NotTokenService.resolveBnsName` in `src/lib/not-token-service.ts`) — Read-only call to the BNS-V2 contract (`SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF.BNS-V2`) to turn a name like `lucky.btc` into a Stacks principal.

3. **Message construction** (`src/lib/sip-018.ts`) — Builds a SIP-018 structured-data hash (`SIP018` prefix + domain hash + message hash). The message tuple has topic `not-transfer` plus recipient, amount, and optional memo.

4. **Passkey signing** (`NotTokenService.signWithPasskey`) — The SIP-018 hash is SHA-256'd into a WebAuthn challenge, signed via `navigator.credentials.get`. The signature and the COSE public key (parsed out of the authenticator data CBOR by `extractPublicKeyFromAuthenticatorData`) are returned as hex.

5. **Broadcast** (`supabase/functions/submit-not-transfer/index.ts`) — A Deno Edge Function. It receives recipient/amount/memo/message/signature, builds a contract call to the NOT token contract, signs it with the server's `STX_PRIVATE_KEY`, and broadcasts to **mainnet**. The browser never broadcasts.

`src/pages/Index.tsx` toggles between `PasskeyAuth` and `NothingTransfer` based on local auth state. `src/App.tsx` wires React Router, React Query, and the toast providers.

## Network and contracts

The app is hardcoded to **mainnet** (`NothingTransfer.tsx` fixes `network` to `"mainnet"`; the Edge Function uses `STACKS_MAINNET`). The `network` parameter in `not-token-service.ts` supports testnet but is not exercised by the UI.

- NOT token contract: `SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ.nope` (asset `NOT`, 0 decimals)
- The Edge Function's target contract/function come from server env vars (`NOT_CONTRACT_ADDRESS`, `NOT_CONTRACT_NAME`, `NOT_FUNCTION_NAME`), not the client constant above.

## Configuration

- Client env (`.env`, Vite-exposed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Consumed in `src/integrations/supabase/client.ts`.
- Edge Function env (set in Supabase, not in repo): `STX_PRIVATE_KEY`, `NOT_CONTRACT_ADDRESS`, `NOT_CONTRACT_NAME`, `NOT_FUNCTION_NAME`.
- `supabase/config.toml` sets `verify_jwt = false` for `submit-not-transfer` — it is a public, unauthenticated endpoint.
- `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` are auto-generated; do not hand-edit.

## Conventions and gotchas

- **WebAuthn `rp.id`**: both creation and signing normalize the hostname — `127.0.0.1`/`::1`/anything with a port collapses to `localhost`, then the port is stripped. Keep the creation and signing logic in sync; a mismatch makes assertions fail silently.
- **Credential ID encoding**: encoding happens in `PasskeyAuth.tsx` (encode) and `not-token-service.ts` (decode); they must use the same base64 scheme. `src/__tests__/passkey-auth.test.ts` exists specifically to guard this round-trip — run it after touching either side.
- UI is shadcn/ui (`src/components/ui/`, generated via `components.json`) with Tailwind. New primitives should be added through the shadcn workflow rather than hand-written.
- The `componentTagger()` Vite plugin runs only in development mode (Lovable tooling).
