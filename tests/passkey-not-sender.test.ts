import { describe, expect, it } from "vitest";
import type { Simnet } from "@stacks/clarinet-sdk";
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
