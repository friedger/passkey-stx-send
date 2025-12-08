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
import { NotTokenService } from "@/lib/not-token-service";
import { CheckCircle2, Loader2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface NothingTransferProps {
  username: string;
  credential: any;
  onLogout: () => void;
}

export const NothingTransfer = ({
  username,
  credential,
  onLogout,
}: NothingTransferProps) => {
  const [bnsName, setBnsName] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txId, setTxId] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [network] = useState<"testnet" | "mainnet">("mainnet");

  const handleTransfer = async () => {
    if (!bnsName.trim()) {
      toast.error("Please enter a BNS name");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount of Nothing");
      return;
    }

    setIsLoading(true);
    setTxId("");

    try {
      toast.info("Resolving BNS name...");
      const resolvedAddress = await NotTokenService.resolveBnsName(bnsName, network);

      if (!resolvedAddress) {
        toast.error("Could not resolve BNS name. Please check the name and try again.");
        setIsLoading(false);
        return;
      }

      setRecipientAddress(resolvedAddress);
      toast.success(`Resolved to: ${resolvedAddress.substring(0, 10)}...`);

      toast.info("Preparing to send Nothing...");

      const result = await NotTokenService.transfer({
        recipientBnsName: bnsName,
        amount,
        memo,
        network,
      });

      if (!result.success) {
        toast.error(result.error || "Transfer failed");
        return;
      }

      setTxId(result.txId!);
      toast.success("Nothing sent successfully! 🎉");

      setBnsName("");
      setAmount("");
      setMemo("");
      setRecipientAddress("");
      
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error("Failed to send Nothing: " + error.message);
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
              <CardTitle className="text-2xl">Send {NotTokenService.name}</CardTitle>
              <CardDescription>
                Give someone absolutely Nothing using their BNS name
              </CardDescription>
            </div>
            <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-background">
              <img 
                src={NotTokenService.logo} 
                alt={`${NotTokenService.symbol} token`}
                className="w-full h-full object-contain"
              />
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
            <Label htmlFor="bnsname">Who gets Nothing?</Label>
            <Input
              id="bnsname"
              placeholder="lucky.btc"
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
            <Label htmlFor="amount">How much Nothing?</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                step="1"
                min="1"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                className="pr-16"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground text-sm font-medium">
                {NotTokenService.symbol}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">Say something about Nothing</Label>
            <Input
              id="memo"
              placeholder="Here's Nothing for you..."
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
                Sending Nothing...
              </>
            ) : (
              <>
                <img 
                  src={NotTokenService.logo} 
                  alt="" 
                  className="w-4 h-4"
                />
                Send Nothing
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
                <p className="font-semibold text-sm">Nothing Sent Successfully!</p>
                <p className="text-xs text-muted-foreground break-all">
                  TX ID: {txId}
                </p>
                <a
                  href={NotTokenService.getExplorerUrl(txId, network)}
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
