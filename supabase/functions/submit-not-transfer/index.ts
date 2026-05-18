import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { broadcastTransaction } from "npm:@stacks/transactions@7.4.0";
import { typedMakeContractCall } from "npm:clarity-abitype@0.6.0/stacks-js";
import { passkeyNotSenderAbi } from "./passkey-not-sender-abi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Hex-encode a byte array (0x-prefixed). */
function toHex(bytes: number[] | Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

// Relays a passkey-signed NOT transfer to the passkey-not-sender contract.
// Argument encoding is driven by the contract ABI via clarity-abitype's
// `typedMakeContractCall` - no manual ClarityValue wrapping. The server only
// pays the STX fee; all authorization is verified on-chain.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      publicKey,
      amount,
      name,
      namespace,
      memo,
      nonce,
      authenticatorData,
      clientDataPrefix,
      clientDataSuffix,
      signature,
    } = await req.json();

    console.log("Received transfer request:", {
      publicKey,
      amount,
      name,
      namespace,
      memo,
      nonce,
    });

    const privateKey = Deno.env.get("STX_PRIVATE_KEY");
    const contractAddress = Deno.env.get("PASSKEY_CONTRACT_ADDRESS");
    const contractName =
      Deno.env.get("PASSKEY_CONTRACT_NAME") ?? "passkey-not-sender";

    if (!privateKey || !contractAddress) {
      console.error("Missing environment variables:", {
        hasPrivateKey: !!privateKey,
        hasContractAddress: !!contractAddress,
      });
      throw new Error(
        "Missing required environment variables (STX_PRIVATE_KEY, PASSKEY_CONTRACT_ADDRESS)"
      );
    }

    // Typed contract call: functionArgs are plain TypeScript values and the
    // ABI drives the conversion to ClarityValues. Buffers are hex strings;
    // the memo text is UTF-8 encoded to match the SIP-018 message the
    // passkey signed.
    const transaction = await typedMakeContractCall({
      abi: passkeyNotSenderAbi,
      contractAddress,
      contractName,
      functionName: "transfer-not",
      functionArgs: [
        publicKey, // (buff 33)  public-key
        BigInt(amount), // uint        amount
        toHex(new TextEncoder().encode(name)), // (buff 48)  BNS name
        toHex(new TextEncoder().encode(namespace)), // (buff 20)  BNS namespace
        memo ? toHex(new TextEncoder().encode(memo)) : null, // (optional (buff 34)) memo
        BigInt(nonce), // uint        nonce
        toHex(authenticatorData), // (buff 256) authenticator-data
        toHex(clientDataPrefix), // (buff 128) client-data-prefix
        toHex(clientDataSuffix), // (buff 512) client-data-suffix
        toHex(signature), // (buff 64)  signature
      ],
      senderKey: privateKey,
      network: "mainnet",
      postConditionMode: "allow",
    });

    const broadcastResponse = await broadcastTransaction({
      transaction,
      network: "mainnet",
    });

    console.log("Broadcast response:", broadcastResponse);

    if ("error" in broadcastResponse) {
      throw new Error(
        `Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`
      );
    }

    const txId = broadcastResponse.txid;
    console.log("Transaction broadcasted successfully:", txId);

    return new Response(JSON.stringify({ success: true, txId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in submit-not-transfer function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
