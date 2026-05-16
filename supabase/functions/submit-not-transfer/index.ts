import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  bufferCV,
  bufferCVFromString,
  noneCV,
  someCV,
  principalCV,
  uintCV,
} from "npm:@stacks/transactions@7.2.0";
import { STACKS_MAINNET } from "npm:@stacks/network@7.2.0";
import { hexToBytes } from "npm:@stacks/common@7.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Relays a passkey-signed NOT transfer to the `passkey-not-sender` contract.
// The server only pays the STX fee; all authorization is verified on-chain.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      publicKey,
      amount,
      recipientAddress,
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
      recipientAddress,
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

    // transfer-not(public-key, amount, recipient, memo, nonce,
    //              authenticator-data, client-data-prefix, client-data-suffix, signature)
    const functionArgs = [
      bufferCV(hexToBytes(publicKey)),
      uintCV(amount),
      principalCV(recipientAddress),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
      uintCV(nonce),
      bufferCV(new Uint8Array(authenticatorData)),
      bufferCV(new Uint8Array(clientDataPrefix)),
      bufferCV(new Uint8Array(clientDataSuffix)),
      bufferCV(new Uint8Array(signature)),
    ];

    console.log("Building contract call:", {
      contractAddress,
      contractName,
      functionName: "transfer-not",
    });

    const transaction = await makeContractCall({
      contractAddress,
      contractName,
      functionName: "transfer-not",
      functionArgs,
      senderKey: privateKey,
      network: STACKS_MAINNET,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
    });

    const broadcastResponse = await broadcastTransaction({
      transaction,
      network: STACKS_MAINNET,
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
