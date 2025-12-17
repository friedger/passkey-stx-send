import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  bufferCVFromString,
  someCV,
  noneCV,
  principalCV,
} from "npm:@stacks/transactions@7.2.0";
import { STACKS_MAINNET } from "npm:@stacks/network@7.2.0";
import { bytesToHex, hexToBytes } from "npm:@stacks/common@7.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recipientAddress, amount, memo, message, signature } =
      await req.json();

    console.log("Received transfer request:", {
      recipientAddress,
      amount,
      memo,
      messageHex: bytesToHex(new Uint8Array(message)),
      signature,
    });

    // Get environment variables
    const privateKey = Deno.env.get("STX_PRIVATE_KEY");
    const contractAddress = Deno.env.get("NOT_CONTRACT_ADDRESS");
    const contractName = Deno.env.get("NOT_CONTRACT_NAME");
    const functionName = Deno.env.get("NOT_FUNCTION_NAME");

    if (!privateKey || !contractAddress || !contractName || !functionName) {
      console.error("Missing environment variables:", {
        hasPrivateKey: !!privateKey,
        hasContractAddress: !!contractAddress,
        hasContractName: !!contractName,
        hasFunctionName: !!functionName,
      });
      throw new Error("Missing required environment variables");
    }

    console.log("Building contract call:", {
      contractAddress,
      contractName,
      functionName,
    });

    // Build the contract call transaction
    const txOptions = {
      contractAddress,
      contractName,
      functionName,
      functionArgs: [
        uintCV(amount),
        principalCV(recipientAddress),
        memo ? someCV(bufferCVFromString(memo)) : noneCV(),
        bufferCVFromString(signature),
      ],
      senderKey: privateKey,
      network: STACKS_MAINNET,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
    };

    const transaction = await makeContractCall(txOptions);
    console.log("Transaction built successfully");

    // Broadcast the transaction
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
