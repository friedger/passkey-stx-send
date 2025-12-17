import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import {
  bufferCVFromString,
  ClarityType,
  fetchCallReadOnlyFunction,
  noneCV,
  OptionalCV,
  PrincipalCV,
  ResponseOkCV,
  someCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { createMessage, sha256 } from "./sip-018";
import notTokenLogo from "@/assets/not-token-logo.png";
import { bytesToHex } from "@stacks/common";
import { supabase } from "@/integrations/supabase/client";

async function submitSignatureToBackend(
  recipientAddress: string,
  amount: string,
  memo: string | undefined,
  message: Uint8Array,
  signature: string
): Promise<{ txId: string }> {
  const { data, error } = await supabase.functions.invoke("submit-not-transfer", {
    body: {
      recipientAddress,
      amount,
      memo,
      message: Array.from(message),
      signature,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to submit transfer");
  }

  if (!data.success) {
    throw new Error(data.error || "Transfer submission failed");
  }

  return { txId: data.txId };
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

export interface TransferParams {
  recipientBnsName: string;
  amount: string;
  memo?: string;
  network?: "mainnet" | "testnet";
}

export interface TransferResult {
  success: boolean;
  txId?: string;
  recipientAddress?: string;
  signature?: string;
  error?: string;
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
    network: "mainnet" | "testnet" = "mainnet"
  ): Promise<string | null> {
    try {
      const ownerCV = (await fetchCallReadOnlyFunction({
        contractAddress: BNS_V2_CONTRACT.address,
        contractName: BNS_V2_CONTRACT.name,
        functionName: "get-owner-name",
        functionArgs: name.split(".").map((part) => bufferCVFromString(part)),
        senderAddress: BNS_V2_CONTRACT.address,
        network: network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET,
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
   * Create a transfer message for signing
   */
  async createTransferMessage(params: {
    recipientAddress: string;
    amount: string;
    memo?: string;
  }): Promise<Uint8Array> {
    return createMessage(
      tupleCV({
        topic: stringAsciiCV("not-transfer"),
        recipient: bufferCVFromString(params.recipientAddress),
        amount: uintCV(params.amount),
        memo: params.memo
          ? someCV(bufferCVFromString(params.memo))
          : noneCV(),
      })
    );
  },

  /**
   * Sign a message with a passkey credential
   */
  async signWithPasskey(
    message: Uint8Array,
    credentialId: string
  ): Promise<string> {
    const challenge = await sha256(message);

    // Decode base64 string back to Uint8Array
    const credentialIdBuffer = new Uint8Array(
      atob(credentialId).split('').map(c => c.charCodeAt(0))
    );

    console.log("Stored Credential ID:", credentialId, bytesToHex(credentialIdBuffer));

    // Determine the correct rp.id based on environment (must match creation)
    let rpId = window.location.hostname;
    if (rpId === "127.0.0.1" || rpId === "::1" || rpId.includes(":")) {
      rpId = "localhost";
    }
    rpId = rpId.split(":")[0];

    console.log("Authentication RP ID:", rpId);
    console.log("Challenge:", bytesToHex(new Uint8Array(challenge)));

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions =
      {
        challenge: new Uint8Array(challenge),
        rpId: rpId, // Add rpId to match the one used during creation
        allowCredentials: [
          {
            id: credentialIdBuffer,
            type: "public-key",
            transports: ["internal"],
          },
        ],
        timeout: 60000,
        userVerification: "preferred", // Changed to "preferred" for better compatibility
      };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential;

    if (!assertion) {
      throw new Error("Failed to get assertion");
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const signature = new Uint8Array(response.signature);

    return Array.from(signature)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },

  /**
   * Execute a NOT token transfer
   */
  async transfer(params: TransferParams): Promise<TransferResult> {
    const { recipientBnsName, amount, memo, network = "mainnet" } = params;

    try {
      // Step 1: Resolve BNS name
      const recipientAddress = await this.resolveBnsName(
        recipientBnsName,
        network
      );

      if (!recipientAddress) {
        return {
          success: false,
          error: "Could not resolve BNS name",
        };
      }

      // Step 2: Create transfer message
      const message = await this.createTransferMessage({
        recipientAddress,
        amount,
        memo,
      });

      // Step 3: Get stored credential
      const storedCredentialId = localStorage.getItem("stx-passkey-id");
      if (!storedCredentialId) {
        return {
          success: false,
          error: "No passkey credential found. Please authenticate first.",
        };
      }

      // Step 4: Sign with passkey
      const signature = await this.signWithPasskey(message, storedCredentialId);

      const submitResult = await submitSignatureToBackend(recipientAddress, amount, memo, message, signature);

      const txId = submitResult.txId;

      return {
        success: true,
        txId,
        recipientAddress,
        signature,
      };
    } catch (error: any) {
      console.error("Transfer error:", error);
      return {
        success: false,
        error: error.message || "Transfer failed",
      };
    }
  },

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(txId: string, network: "mainnet" | "testnet" = "mainnet"): string {
    return `https://explorer.stacks.co/txid/${txId}?chain=${network}`;
  },
};
