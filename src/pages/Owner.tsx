import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { connect, disconnect, getLocalStorage } from "@stacks/connect";
import { typedCallContract } from "clarity-abitype/stacks-connect";
import { cvToValue, fetchCallReadOnlyFunction } from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { passkeyNotSenderAbi } from "@/contracts/passkey-not-sender-abi";
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
import { Switch } from "@/components/ui/switch";

const DEFAULT_CONTRACT_ADDRESS = "SP3FFRX7C911PZP5RHE148YDVDD9JWVS6FXH7PE67";
const CONTRACT_ADDRESS =
  (import.meta.env.VITE_PASSKEY_SENDER_ADDRESS as string | undefined)?.trim() ||
  DEFAULT_CONTRACT_ADDRESS;
const CONTRACT_NAME = "passkey-not-sender";
const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

/** Stacks address of the currently connected wallet, if any. */
function connectedStxAddress(): string | null {
  return getLocalStorage()?.addresses?.stx?.[0]?.address ?? null;
}

/** Ensure a 0x-prefixed hex string. */
const asHex = (value: string): `0x${string}` => {
  const trimmed = value.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
};

const Owner = () => {
  const [address, setAddress] = useState<string | null>(connectedStxAddress());
  const [owner, setOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // owner action inputs
  const [rpDomain, setRpDomain] = useState("");
  const [registerKey, setRegisterKey] = useState("");
  const [toggleKey, setToggleKey] = useState("");
  const [toggleEnabled, setToggleEnabled] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const loadOwner = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-owner",
        functionArgs: [],
        senderAddress: CONTRACT_ADDRESS,
        network: STACKS_MAINNET,
      });
      setOwner(cvToValue(result) as string);
    } catch (error) {
      console.error("Could not read contract owner:", error);
    }
  }, []);

  useEffect(() => {
    void loadOwner();
  }, [loadOwner]);

  const handleConnect = async () => {
    try {
      await connect();
      setAddress(connectedStxAddress());
    } catch (error) {
      console.error("Wallet connection cancelled:", error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setAddress(null);
  };

  /** Run an owner action, surfacing the resulting txId (or error) as a toast. */
  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    try {
      const txId = await action();
      toast.success("Transaction submitted", { description: txId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Transaction failed", { description: message });
    } finally {
      setBusy(null);
    }
  };

  const isOwner =
    address !== null && owner !== null && address === owner;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-xl mx-auto space-y-4 py-8">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold">Contract Owner</h1>
        </div>

        {/* wallet connection */}
        <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Stacks wallet
            </CardTitle>
            <CardDescription>
              Owner actions are signed with your own wallet via Stacks Connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {address ? (
              <>
                <div className="text-sm break-all">
                  <span className="text-muted-foreground">Connected: </span>
                  {address}
                </div>
                {owner && (
                  <div
                    className={`text-sm flex items-center gap-2 ${
                      isOwner ? "text-primary" : "text-destructive"
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {isOwner
                      ? "This wallet is the contract owner."
                      : "This wallet is NOT the contract owner — calls will be rejected on-chain."}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={handleConnect} variant="hero" className="w-full">
                <Wallet className="w-4 h-4" />
                Connect wallet
              </Button>
            )}
          </CardContent>
        </Card>

        {!CONTRACT_ADDRESS && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              The contract address is not configured. Set
              <code className="mx-1">VITE_PASSKEY_SENDER_ADDRESS</code>
              after deploying <code>passkey-not-sender</code>.
            </CardContent>
          </Card>
        )}

        {address && CONTRACT_ADDRESS && (
          <>
            {/* set-rp-id-hash */}
            <OwnerAction
              title="Set rp.id"
              description="Sets the WebAuthn relying-party domain (rp.id). The contract stores its sha256. Must be set before any transfer can succeed."
              busy={busy === "rp"}
              disabled={!rpDomain.trim()}
              submitLabel="Set rp.id"
              onSubmit={() =>
                run("rp", () =>
                  typedCallContract({
                    abi: passkeyNotSenderAbi,
                    contract: CONTRACT_ID,
                    functionName: "set-rp-id-hash",
                    functionArgs: [rpDomain.trim()],
                    network: "mainnet",
                    postConditionMode: "allow",
                  })
                )
              }
            >
              <Label htmlFor="rp">rp.id (domain)</Label>
              <Input
                id="rp"
                placeholder="send-nothing.app"
                value={rpDomain}
                onChange={(e) => setRpDomain(e.target.value)}
              />
            </OwnerAction>

            {/* register-passkey */}
            <OwnerAction
              title="Register passkey"
              description="Registers a passkey for unlimited, uncapped transfers."
              busy={busy === "register"}
              disabled={!registerKey.trim()}
              submitLabel="Register passkey"
              onSubmit={() =>
                run("register", () =>
                  typedCallContract({
                    abi: passkeyNotSenderAbi,
                    contract: CONTRACT_ID,
                    functionName: "register-passkey",
                    functionArgs: [asHex(registerKey)],
                    network: "mainnet",
                    postConditionMode: "allow",
                  })
                )
              }
            >
              <Label htmlFor="reg">Compressed P-256 public key (33 bytes, hex)</Label>
              <Input
                id="reg"
                placeholder="0x02…"
                value={registerKey}
                onChange={(e) => setRegisterKey(e.target.value)}
              />
            </OwnerAction>

            {/* set-passkey-enabled */}
            <OwnerAction
              title="Enable / disable passkey"
              description="Toggles a registered passkey on or off."
              busy={busy === "toggle"}
              disabled={!toggleKey.trim()}
              submitLabel="Update passkey"
              onSubmit={() =>
                run("toggle", () =>
                  typedCallContract({
                    abi: passkeyNotSenderAbi,
                    contract: CONTRACT_ID,
                    functionName: "set-passkey-enabled",
                    functionArgs: [asHex(toggleKey), toggleEnabled],
                    network: "mainnet",
                    postConditionMode: "allow",
                  })
                )
              }
            >
              <Label htmlFor="tog">Public key (hex)</Label>
              <Input
                id="tog"
                placeholder="0x02…"
                value={toggleKey}
                onChange={(e) => setToggleKey(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Switch
                  id="tog-enabled"
                  checked={toggleEnabled}
                  onCheckedChange={setToggleEnabled}
                />
                <Label htmlFor="tog-enabled">
                  {toggleEnabled ? "Enabled" : "Disabled"}
                </Label>
              </div>
            </OwnerAction>

            {/* withdraw-not */}
            <OwnerAction
              title="Withdraw NOT"
              description="Recovers NOT held by the contract to a recipient."
              busy={busy === "withdraw"}
              disabled={!withdrawAmount.trim() || !withdrawTo.trim()}
              submitLabel="Withdraw NOT"
              onSubmit={() =>
                run("withdraw", () =>
                  typedCallContract({
                    abi: passkeyNotSenderAbi,
                    contract: CONTRACT_ID,
                    functionName: "withdraw-not",
                    functionArgs: [BigInt(withdrawAmount), withdrawTo.trim()],
                    network: "mainnet",
                    postConditionMode: "allow",
                  })
                )
              }
            >
              <Label htmlFor="wamt">Amount (NOT)</Label>
              <Input
                id="wamt"
                type="number"
                min="1"
                placeholder="0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <Label htmlFor="wto">Recipient</Label>
              <Input
                id="wto"
                placeholder="SP…"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
              />
            </OwnerAction>

            {/* set-owner */}
            <OwnerAction
              title="Transfer ownership"
              description="Hands the owner role to another principal. This cannot be undone from this wallet."
              busy={busy === "owner"}
              disabled={!newOwner.trim()}
              submitLabel="Transfer ownership"
              onSubmit={() =>
                run("owner", () =>
                  typedCallContract({
                    abi: passkeyNotSenderAbi,
                    contract: CONTRACT_ID,
                    functionName: "set-owner",
                    functionArgs: [newOwner.trim()],
                    network: "mainnet",
                    postConditionMode: "allow",
                  })
                )
              }
            >
              <Label htmlFor="newowner">New owner principal</Label>
              <Input
                id="newowner"
                placeholder="SP…"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
              />
            </OwnerAction>
          </>
        )}
      </div>
    </div>
  );
};

interface OwnerActionProps {
  title: string;
  description: string;
  busy: boolean;
  disabled: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: React.ReactNode;
}

/** A single owner action: a titled card with inputs and a submit button. */
const OwnerAction = ({
  title,
  description,
  busy,
  disabled,
  submitLabel,
  onSubmit,
  children,
}: OwnerActionProps) => (
  <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      {children}
      <Button
        onClick={onSubmit}
        disabled={busy || disabled}
        className="w-full mt-2"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </CardContent>
  </Card>
);

export default Owner;
