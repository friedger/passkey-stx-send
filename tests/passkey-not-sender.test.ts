import { describe, expect, it } from "vitest";
import type { Simnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  typedCallPublicFn,
  typedCallReadOnlyFn,
} from "clarity-abitype/clarinet-sdk";
import { passkeyNotSenderAbi } from "../src/contracts/passkey-not-sender-abi";

declare global {
  // `simnet` is injected by the clarinet vitest environment.
  // eslint-disable-next-line no-var
  var simnet: Simnet;
}

const CONTRACT = "passkey-not-sender";
const abi = passkeyNotSenderAbi;

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex.slice(2), "hex"));
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return new Uint8Array(Buffer.from(b64 + "=".repeat(pad), "base64"));
}

function derToRawSignature(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("Invalid DER signature");
  let offset = 2;
  if (der[offset] !== 0x02) throw new Error("Invalid DER signature");
  const rLen = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  if (der[offset] !== 0x02) throw new Error("Invalid DER signature");
  const sLen = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLen);

  const fix32 = (part: Uint8Array) => {
    let start = 0;
    while (start < part.length - 1 && part[start] === 0x00) start += 1;
    const trimmed = part.subarray(start);
    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };

  const raw = new Uint8Array(64);
  raw.set(fix32(r), 0);
  raw.set(fix32(s), 32);
  return raw;
}

// 33-byte compressed P-256 public keys (hex) used to key the registry.
const PUBKEY_A = `0x02${"a1".repeat(32)}` as const;
const PUBKEY_B = `0x03${"b2".repeat(32)}` as const;

describe("passkey-not-sender", () => {
  const deployer = simnet.deployer;
  const wallet1 = simnet.getAccounts().get("wallet_1")!;

  describe("passkey registry", () => {
    it("get-nonce returns 0 for an unregistered passkey", () => {
      const { result } = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-nonce",
        functionArgs: [PUBKEY_A],
        sender: deployer,
      });
      expect(result).toBe(0n);
    });

    it("get-passkey returns none for an unregistered passkey", () => {
      const { result } = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-passkey",
        functionArgs: [PUBKEY_A],
        sender: deployer,
      });
      expect(result).toBeNull();
    });

    it("rejects register-passkey from a non-owner (ERR_NOT_OWNER)", () => {
      const { result } = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "register-passkey",
        functionArgs: [PUBKEY_A],
        sender: wallet1,
      });
      expect(result).toEqual({ error: 100n });
    });

    it("lets the owner register a passkey, then reads it back", () => {
      const registration = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "register-passkey",
        functionArgs: [PUBKEY_B],
        sender: deployer,
      });
      expect(registration.result).toEqual({ ok: true });

      const { result } = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-passkey",
        functionArgs: [PUBKEY_B],
        sender: deployer,
      });
      expect(result).toEqual({ nonce: 0n, enabled: true });
    });

    it("rejects registering the same passkey twice (ERR_ALREADY_REGISTERED)", () => {
      typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "register-passkey",
        functionArgs: [PUBKEY_A],
        sender: deployer,
      });
      const { result } = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "register-passkey",
        functionArgs: [PUBKEY_A],
        sender: deployer,
      });
      expect(result).toEqual({ error: 107n });
    });
  });

  describe("transfer-not", () => {
    it("rejects an unregistered passkey (ERR_PASSKEY_NOT_FOUND)", () => {
      const { result } = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "transfer-not",
        functionArgs: [
          `0x02${"cc".repeat(32)}`, // unregistered public-key
          1n, // amount
          deployer, // recipient
          null, // memo
          0n, // nonce
          `0x${"00".repeat(37)}`, // authenticator-data
          "0x", // client-data-prefix
          "0x", // client-data-suffix
          `0x${"00".repeat(64)}`, // signature
        ],
        sender: deployer,
      });
      expect(result).toEqual({ error: 101n });
    });

    it("happy path: registers a passkey and transfers with a valid signature", () => {
      const rpId = new TextEncoder().encode("example.com");
      const rpIdHash = sha256(rpId);

      const setRp = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "set-rp-id-hash",
        functionArgs: [bytesToHex(rpIdHash)],
        sender: deployer,
      });
      expect(setRp.result).toEqual({ ok: true });

      const { privateKey, publicKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });
      const jwk = publicKey.export({ format: "jwk" });
      if (!jwk.x || !jwk.y) {
        throw new Error("Expected P-256 public key coordinates");
      }
      const x = base64urlDecode(jwk.x);
      const y = base64urlDecode(jwk.y);
      const compressed = new Uint8Array(33);
      compressed[0] = (y[31] & 1) === 0 ? 0x02 : 0x03;
      compressed.set(x, 1);
      const publicKeyHex = bytesToHex(compressed);

      const register = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "register-passkey",
        functionArgs: [publicKeyHex],
        sender: deployer,
      });
      expect(register.result).toEqual({ ok: true });

      // Fund the contract with NOT. A fresh simnet mints no NOT, so:
      //  1. mint micro-nthng (the token NOT wraps) to a wallet via its
      //     private `mint!`;
      //  2. wrap-nthng turns micro-nthng into NOT, but only for a caller
      //     whose `contract-caller` is the .napper contract - and clarinet-sdk
      //     rejects a contract principal as a tx sender. So deploy a minimal
      //     stub at that exact principal and wrap through it;
      //  3. transfer the resulting NOT to the passkey-not-sender contract.
      const NOPE = "SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ.nope";
      const MICRO_NTHNG = "SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ.micro-nthng";
      const NOPE_DEPLOYER = "SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ";
      const contractPrincipal = `${simnet.deployer}.${CONTRACT}`;
      const funded = 1000n;

      // .napper stub: forwards to nope.wrap-nthng so wrap-nthng sees
      // `contract-caller` == .napper. Deployed by the nope deployer so its
      // principal is exactly SP32AEEF....napper.
      simnet.deployContract(
        "napper",
        "(define-public (boot-wrap (amount uint))\n" +
          "  (contract-call? 'SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ.nope wrap-nthng amount))",
        null,
        NOPE_DEPLOYER
      );

      simnet.callPrivateFn(
        MICRO_NTHNG,
        "mint!",
        [Cl.principal(simnet.deployer), Cl.uint(funded)],
        simnet.deployer
      );
      const wrapped = simnet.callPublicFn(
        `${NOPE_DEPLOYER}.napper`,
        "boot-wrap",
        [Cl.uint(funded)],
        simnet.deployer
      );
      expect(wrapped.result).toStrictEqual(Cl.ok(Cl.bool(true)));
      const funding = simnet.callPublicFn(
        NOPE,
        "transfer",
        [
          Cl.uint(funded),
          Cl.principal(simnet.deployer),
          Cl.principal(contractPrincipal),
          Cl.none(),
        ],
        simnet.deployer
      );
      expect(funding.result).toStrictEqual(Cl.ok(Cl.bool(true)));

      const amount = 1n;
      const nonce = 0n;
      const recipient = wallet1;

      const challenge = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-transfer-message-hash",
        functionArgs: [amount, recipient, null, nonce],
        sender: deployer,
      });
      const challengeBytes = hexToBytes(challenge.result);

      const authenticatorData = new Uint8Array(37);
      authenticatorData.set(rpIdHash, 0);
      authenticatorData[32] = 0x01; // user present

      const prefixStr = '{"type":"webauthn.get","challenge":"';
      const suffixStr = '","origin":"https://example.com"}';
      const clientDataJson = `${prefixStr}${base64urlEncode(challengeBytes)}${suffixStr}`;
      const clientDataHash = sha256(new TextEncoder().encode(clientDataJson));

      const signedMessage = new Uint8Array(authenticatorData.length + clientDataHash.length);
      signedMessage.set(authenticatorData, 0);
      signedMessage.set(clientDataHash, authenticatorData.length);

      const derSig = sign("sha256", Buffer.from(signedMessage), privateKey);
      const signature = derToRawSignature(new Uint8Array(derSig));

      const transfer = typedCallPublicFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "transfer-not",
        functionArgs: [
          publicKeyHex,
          amount,
          recipient,
          null,
          nonce,
          bytesToHex(authenticatorData),
          bytesToHex(new TextEncoder().encode(prefixStr)),
          bytesToHex(new TextEncoder().encode(suffixStr)),
          bytesToHex(signature),
        ],
        sender: deployer,
      });
      expect(transfer.result).toEqual({ ok: true });

      const stored = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-passkey",
        functionArgs: [publicKeyHex],
        sender: deployer,
      });
      expect(stored.result).toEqual({ nonce: 1n, enabled: true });
    });
  });

  describe("read-only helpers", () => {
    it("get-challenge-base64 returns a 43-byte base64url challenge", () => {
      const { result } = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-challenge-base64",
        functionArgs: [5n, deployer, null, 0n],
        sender: deployer,
      });
      // a (buff 43) comes back as a 0x-prefixed hex string of 86 hex chars
      expect(result).toMatch(/^0x[0-9a-f]{86}$/);
    });

    it("get-transfer-message-hash is a deterministic 32-byte hash", () => {
      const args = [7n, deployer, null, 3n] as const;
      const first = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-transfer-message-hash",
        functionArgs: args,
        sender: deployer,
      });
      const second = typedCallReadOnlyFn({
        simnet,
        abi,
        contract: CONTRACT,
        functionName: "get-transfer-message-hash",
        functionArgs: args,
        sender: deployer,
      });
      expect(first.result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(first.result).toBe(second.result);
    });
  });
});
