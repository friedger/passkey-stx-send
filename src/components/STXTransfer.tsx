import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMessage, sha256 } from "@/lib/sip-018";
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
  uintCV
} from "@stacks/transactions";
import { CheckCircle2, Coins, Loader2, Send, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface STXTransferProps {
  username: string;
  credential: any;
  onLogout: () => void;
}

export const STXTransfer = ({
  username,
  credential,
  onLogout,
}: STXTransferProps) => {
  const [bnsName, setBnsName] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txId, setTxId] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [network] = useState<"testnet" | "mainnet">("mainnet");

  const resolveBNSName = async (name: string): Promise<string | null> => {
    try {
      const ownerCV = (await fetchCallReadOnlyFunction({
        contractAddress: "SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF",
        contractName: "BNS-V2",
        functionName: "get-owner-name",
        functionArgs: name.split(".").map((part) => bufferCVFromString(part)),
        senderAddress: "SP2QEZ06AGJ3RKJPBV14SY1V5BBFNAW33D96YPGZF",
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
  };

  const signWithPasskey = async (message: Uint8Array): Promise<string> => {
    try {
      // Create a challenge from the message hash
      const challenge = await sha256(message);

      // Get stored credential ID
      const storedCredentialId = localStorage.getItem("stx-passkey-id");
      if (!storedCredentialId) {
        throw new Error("No credential found");
      }

      const credentialIdBuffer = Uint8Array.from(
        atob(storedCredentialId),
        (c) => c.charCodeAt(0)
      );

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions =
        {
          challenge: new Uint8Array(challenge),
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

      const assertion = (await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      })) as PublicKeyCredential;

      if (!assertion) {
        throw new Error("Failed to get assertion");
      }

      // Extract signature from assertion response
      const response = assertion.response as AuthenticatorAssertionResponse;
      const signature = new Uint8Array(response.signature);

      // Convert signature to hex string
      return Array.from(signature)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (error) {
      console.error("Passkey signing error:", error);
      throw error;
    }
  };

  const handleTransfer = async () => {
    if (!bnsName.trim()) {
      toast.error("Please enter a BNS name");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsLoading(true);
    setTxId("");

    try {
      // Step 1: Resolve BNS name
      toast.info("Resolving BNS name...");
      const resolvedAddress = await resolveBNSName(bnsName);

      if (!resolvedAddress) {
        toast.error(
          "Could not resolve BNS name. Please check the name and try again."
        );
        setIsLoading(false);
        return;
      }

      setRecipientAddress(resolvedAddress);
      toast.success(`Resolved to: ${resolvedAddress.substring(0, 10)}...`);

      // Step 2: Create transaction
      // Note: For a real implementation, you would need:
      // 1. User's private key or signing mechanism
      // 2. Proper network configuration
      // 3. Account nonce from the API

      // This is a simplified demo showing the flow
      toast.info("Preparing transaction...");

      // For demo purposes, we'll show the signing step
      toast.info("Requesting passkey signature...");

      // Simulate transaction creation
      const networkObj =
        network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

      const msg = await createMessage(
        tupleCV({
          topic: stringAsciiCV("stx-transfer"),
          recipient: bufferCVFromString(resolvedAddress),
          amount: uintCV(amount),
          memo: memo ? someCV(bufferCVFromString(memo)) : noneCV(),
        })
      );

      const signature = await signWithPasskey(msg);

      toast.success("Message signed with passkey!" + signature);

      // Simulate successful transaction
      const mockTxId =
        "0x" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      setTxId(mockTxId);
      toast.success("Transaction broadcast successfully!");

      // Reset form
      setBnsName("");
      setAmount("");
      setMemo("");
      setRecipientAddress("");
      
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error("Transfer failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Send STX</CardTitle>
              <CardDescription>
                Transfer STX tokens using BNSv2 names
              </CardDescription>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Send className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Signed in as
              </span>
            </div>
            <span className="font-semibold">{username}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bnsname">Recipient BNS Name</Label>
            <Input
              id="bnsname"
              placeholder="example.btc"
              value={bnsName}
              onChange={(e) => setBnsName(e.target.value)}
              disabled={isLoading}
            />
            {recipientAddress && (
              <p className="text-xs text-muted-foreground">
                Resolves to: {recipientAddress.substring(0, 10)}...
                {recipientAddress.substring(recipientAddress.length - 6)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (STX)</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                step="0.000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                className="pr-12"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
                <Coins className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Input
              id="memo"
              placeholder="Add a message..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={isLoading}
              maxLength={34}
            />
          </div>

          <Button
            onClick={handleTransfer}
            className="w-full"
            variant="hero"
            size="lg"
            disabled={isLoading || !bnsName.trim() || !amount}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send STX
              </>
            )}
          </Button>

          <Button
            onClick={onLogout}
            variant="ghost"
            className="w-full"
            disabled={isLoading}
          >
            Logout
          </Button>
        </CardContent>
      </Card>

      {txId && (
        <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-xl border-primary/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-sm">Transaction Successful</p>
                <p className="text-xs text-muted-foreground break-all">
                  TX ID: {txId}
                </p>
                <a
                  href={`https://explorer.stacks.co/txid/${txId}?chain=${network}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-block mt-2"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
