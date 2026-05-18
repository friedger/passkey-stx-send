import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import {
  bufferCV,
  bufferCVFromString,
  ClarityType,
  cvToValue,
  fetchCallReadOnlyFunction,
  noneCV,
  OptionalCV,
  PrincipalCV,
  principalCV,
  ResponseOkCV,
  someCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";
import { createMessage } from "./sip-018";
import { derToRawSignature, splitClientData } from "./webauthn";
import {
  buildNothingSentNote,
  deriveNostrKeyFromPrf,
  getNpub,
  nostrPrfSalt,
  postNote,
} from "./nostr";
import notTokenLogo from "@/assets/not-token-logo.png";
import { supabase } from "@/integrations/supabase/client";

type Network = "mainnet" | "testnet";

const networkOf = (network: Network) =>
  network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

/**
 * Extract public key from authenticator data (CBOR format)
 * The public key is embedded in the attestation object's authenticator data
 */
export function extractPublicKeyFromAuthenticatorData(
  authenticatorData: ArrayBuffer
): Uint8Array | null {
  const view = new Uint8Array(authenticatorData);

  // Authenticator data structure:
  // [0-32] RP ID hash
  // [33] flags
  // [34-37] sign count
  // [38+] attested credential data (if present)

  const flags = view[32];
  const hasAttestedCredentialData = (flags & 0x40) !== 0; // Check bit 6

  if (!hasAttestedCredentialData) {
    console.warn("No attested credential data found in authenticator data");
    return null;
  }

  // Start of attested credential data (after flags and sign count)
  let offset = 37;

  // [0-15] aaguid (16 bytes)
  offset += 16;

  // [16-17] credentialIdLength (big-endian)
  const credentialIdLength = (view[offset] << 8) | view[offset + 1];
  offset += 2;

  // Skip credential ID
  offset += credentialIdLength;

  // Remaining data is the public key in CBOR format
  return view.slice(offset);
}

// NOT Token Contract Details
const NOT_TOKEN_CONTRACT = {
  address: "SP32AEEF6WW5Y0NMJ1S8SBSZDAY8R5J32NBZFPKKZ",
  name: "nope",
  assetName: "NOT",
};

const BNS_V2_CONTRACT = {
  address: "SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF",
  name: "BNS-V2",
};

// Passkey-verifying sender contract (contracts/passkey-not-sender.clar, Clarity 5).
// Set VITE_PASSKEY_SENDER_ADDRESS to the deployer address after deployment.
const PASSKEY_SENDER_CONTRACT = {
  address:
    (import.meta.env.VITE_PASSKEY_SENDER_ADDRESS as string | undefined) ??
    "SP3FFRX7C911PZP5RHE148YDVDD9JWVS6FXH7PE67",
  name: "passkey-not-sender",
};

export interface TransferParams {
  recipientBnsName: string;
  amount: string;
  memo?: string;
  network?: Network;
}

export interface TransferResult {
  success: boolean;
  txId?: string;
  recipientAddress?: string;
  error?: string;
  // Nostr key derived from the passkey PRF; present only if the authenticator
  // supports the PRF extension. Ephemeral - held in memory, never persisted.
  nostrSecretKey?: Uint8Array;
}

export interface PasskeyState {
  registered: boolean;
  enabled: boolean;
  nonce: number;
}

async function submitTransferToBackend(body: {
  publicKey: string;
  amount: string;
  bnsName: string;
  bnsNamespace: string;
  memo: string | undefined;
  nonce: number;
  authenticatorData: Uint8Array;
  clientDataPrefix: Uint8Array;
  clientDataSuffix: Uint8Array;
  signature: Uint8Array;
}): Promise<{ txId: string }> {
  const { data, error } = await supabase.functions.invoke("submit-not-transfer", {
    body: {
      publicKey: body.publicKey,
      amount: body.amount,
      bnsName: body.bnsName,
      bnsNamespace: body.bnsNamespace,
      memo: body.memo,
      nonce: body.nonce,
      authenticatorData: Array.from(body.authenticatorData),
      clientDataPrefix: Array.from(body.clientDataPrefix),
      clientDataSuffix: Array.from(body.clientDataSuffix),
      signature: Array.from(body.signature),
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to submit transfer");
  }
  if (!data?.success) {
    throw new Error(data?.error || "Transfer submission failed");
  }
  return { txId: data.txId };
}

/** Split "alice.btc" → { name: "alice", namespace: "btc" }. */
function splitBnsName(bns: string): { name: string; namespace: string } {
  const parts = bns.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid BNS name: ${bns}`);
  }
  return { name: parts[0], namespace: parts[1] };
}

export const NotTokenService = {
  // Token metadata
  name: "Nothing",
  symbol: "NOT",
  logo: notTokenLogo,
  decimals: 0,
  contract: NOT_TOKEN_CONTRACT,

  /**
   * Resolve a BNS name to a Stacks address
   */
  async resolveBnsName(
    name: string,
    network: Network = "mainnet"
  ): Promise<string | null> {
    try {
      const ownerCV = (await fetchCallReadOnlyFunction({
        contractAddress: BNS_V2_CONTRACT.address,
        contractName: BNS_V2_CONTRACT.name,
        functionName: "get-owner-name",
        functionArgs: name.split(".").map((part) => bufferCVFromString(part)),
        senderAddress: BNS_V2_CONTRACT.address,
        network: networkOf(network),
      })) as ResponseOkCV<OptionalCV<PrincipalCV>>;

      if (ownerCV.value.type === ClarityType.OptionalSome) {
        return ownerCV.value.value.value;
      }
      return null;
    } catch (error) {
      console.error("BNS resolution error:", error);
      return null;
    }
  },

  /**
   * Read on-chain registration state and the next expected nonce for a passkey.
   */
  async getPasskeyState(
    publicKeyHex: string,
    network: Network = "mainnet"
  ): Promise<PasskeyState> {
    if (!PASSKEY_SENDER_CONTRACT.address) {
      throw new Error(
        "Passkey sender contract not configured — set VITE_PASSKEY_SENDER_ADDRESS"
      );
    }

    const result = await fetchCallReadOnlyFunction({
      contractAddress: PASSKEY_SENDER_CONTRACT.address,
      contractName: PASSKEY_SENDER_CONTRACT.name,
      functionName: "get-passkey",
      functionArgs: [bufferCV(hexToBytes(publicKeyHex))],
      senderAddress: PASSKEY_SENDER_CONTRACT.address,
      network: networkOf(network),
    });

    // (optional (tuple (enabled bool) (nonce uint))) -> object | null
    const value = cvToValue(result) as
      | { nonce: bigint | number | string; enabled: boolean }
      | null;

    if (!value) {
      return { registered: false, enabled: false, nonce: 0 };
    }
    return {
      registered: true,
      enabled: Boolean(value.enabled),
      nonce: Number(value.nonce),
    };
  },

  /**
   * Create the SIP-018 transfer message. Its hash is used directly as the
   * WebAuthn challenge and is recomputed on-chain by the contract.
   */
  async createTransferMessage(params: {
    recipientAddress: string;
    amount: string;
    memo?: string;
    nonce: number;
  }): Promise<Uint8Array> {
    return createMessage(
      tupleCV({
        topic: stringAsciiCV("not-transfer"),
        amount: uintCV(params.amount),
        recipient: principalCV(params.recipientAddress),
        memo: params.memo
          ? someCV(bufferCVFromString(params.memo))
          : noneCV(),
        nonce: uintCV(params.nonce),
      })
    );
  },

  /**
   * Sign the SIP-018 transfer hash with a passkey and return the raw WebAuthn
   * assertion parts (signature converted from DER to raw r||s).
   */
  async signWithPasskey(
    challenge: Uint8Array,
    credentialId: string
  ): Promise<{
    signature: Uint8Array;
    authenticatorData: Uint8Array;
    clientDataJSON: Uint8Array;
    prfOutput?: Uint8Array;
  }> {
    const credentialIdBuffer = new Uint8Array(
      atob(credentialId)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    // Determine the correct rp.id (must match passkey creation)
    let rpId = window.location.hostname;
    if (rpId === "127.0.0.1" || rpId === "::1" || rpId.includes(":")) {
      rpId = "localhost";
    }
    rpId = rpId.split(":")[0];

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions =
      {
        challenge: challenge as BufferSource,
        rpId,
        allowCredentials: [
          {
            id: credentialIdBuffer,
            type: "public-key",
            transports: ["internal"],
          },
        ],
        timeout: 60000,
        userVerification: "required",
      };

    // Request the PRF extension so this same assertion also yields the secret
    // used to derive the Nostr identity (Breez passkey-login scheme).
    (publicKeyCredentialRequestOptions as { extensions?: unknown }).extensions =
      { prf: { eval: { first: nostrPrfSalt() } } };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential;

    if (!assertion) {
      throw new Error("Failed to get passkey assertion");
    }

    const response = assertion.response as AuthenticatorAssertionResponse;

    // PRF output - present only if the authenticator supports the extension.
    const extResults = assertion.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };
    const prfFirst = extResults.prf?.results?.first;

    return {
      signature: derToRawSignature(new Uint8Array(response.signature)),
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      prfOutput: prfFirst ? new Uint8Array(prfFirst) : undefined,
    };
  },

  /**
   * Execute a NOT token transfer: resolve recipient, fetch nonce, sign with the
   * passkey, and relay the assertion to the contract via the backend.
   */
  async transfer(params: TransferParams): Promise<TransferResult> {
    const { recipientBnsName, amount, memo, network = "mainnet" } = params;

    try {
      const publicKey = localStorage.getItem("stx-passkey-pubkey");
      if (!publicKey) {
        return {
          success: false,
          error: "No passkey public key found. Please (re)create your passkey.",
        };
      }

      const credentialId = localStorage.getItem("stx-passkey-id");
      if (!credentialId) {
        return {
          success: false,
          error: "No passkey credential found. Please authenticate first.",
        };
      }

      // Step 1: Resolve BNS name
      const recipientAddress = await this.resolveBnsName(
        recipientBnsName,
        network
      );
      if (!recipientAddress) {
        return { success: false, error: "Could not resolve BNS name" };
      }

      // Step 2: Read the passkey's on-chain state. Any passkey gets one
      // free transfer (up to 10k NOT); a registered + enabled passkey can
      // transfer repeatedly. Only a used or disabled passkey is blocked.
      const state = await this.getPasskeyState(publicKey, network);
      if (state.registered && !state.enabled) {
        return {
          success: false,
          error:
            "This passkey can't send NOT - its free transfer was already used, or it was disabled.",
        };
      }

      // Step 3: Build the SIP-018 transfer message (the WebAuthn challenge)
      const message = await this.createTransferMessage({
        recipientAddress,
        amount,
        memo,
        nonce: state.nonce,
      });

      // Step 4: Sign with the passkey (also yields the PRF output)
      const { signature, authenticatorData, clientDataJSON, prfOutput } =
        await this.signWithPasskey(message, credentialId);

      // Derive the Nostr identity from the PRF output, if available
      let nostrSecretKey: Uint8Array | undefined;
      if (prfOutput) {
        try {
          nostrSecretKey = deriveNostrKeyFromPrf(prfOutput);
        } catch (err) {
          console.warn("Could not derive Nostr key from PRF:", err);
        }
      }

      // Step 5: Split clientDataJSON around the base64url challenge
      const { prefix, suffix } = splitClientData(clientDataJSON, message);

      // Step 6: Relay to the contract via the backend
      const { txId } = await submitTransferToBackend({
        publicKey,
        amount,
        recipientAddress,
        memo,
        nonce: state.nonce,
        authenticatorData,
        clientDataPrefix: prefix,
        clientDataSuffix: suffix,
        signature,
      });

      return { success: true, txId, recipientAddress, nostrSecretKey };
    } catch (error: any) {
      console.error("Transfer error:", error);
      return {
        success: false,
        error: error?.message || "Transfer failed",
      };
    }
  },

  /**
   * Poll the Stacks API until the transaction is confirmed on-chain.
   */
  async waitForConfirmation(
    txId: string,
    network: Network = "mainnet",
    options: { intervalMs?: number; maxAttempts?: number } = {}
  ): Promise<void> {
    const { intervalMs = 8000, maxAttempts = 90 } = options;
    const apiBase =
      network === "mainnet"
        ? "https://api.hiro.so"
        : "https://api.testnet.hiro.so";
    const id = txId.startsWith("0x") ? txId : `0x${txId}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(`${apiBase}/extended/v1/tx/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tx_status === "success") return;
          if (
            typeof data.tx_status === "string" &&
            data.tx_status.startsWith("abort")
          ) {
            throw new Error(`Transaction failed on-chain (${data.tx_status})`);
          }
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.startsWith("Transaction failed")
        ) {
          throw err;
        }
        // transient network/API error - keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error("Timed out waiting for on-chain confirmation");
  },

  /**
   * Wait for the transfer to confirm, then publish a Nostr note announcing
   * that Nothing was sent. The Nostr key is derived from the passkey PRF.
   */
  async announceOnNostr(params: {
    txId: string;
    recipientBnsName: string;
    memo?: string;
    network?: Network;
    nostrSecretKey: Uint8Array;
  }): Promise<{ noteUri: string; npub: string }> {
    const {
      txId,
      recipientBnsName,
      memo,
      network = "mainnet",
      nostrSecretKey,
    } = params;

    await this.waitForConfirmation(txId, network);

    const content = buildNothingSentNote({
      txId,
      memo,
      recipientBnsName,
      network,
    });
    const { noteUri } = await postNote(nostrSecretKey, content);
    return { noteUri, npub: getNpub(nostrSecretKey) };
  },

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(txId: string, network: Network = "mainnet"): string {
    return `https://explorer.stacks.co/txid/${txId}?chain=${network}`;
  },
};
