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
import { extractPublicKeyFromAuthenticatorData } from "@/lib/not-token-service";
import { coseToCompressedPublicKey } from "@/lib/webauthn";
import { getErrorMessage } from "@/lib/utils";
import { deriveNostrKeyFromPrf, getNpub, nostrPrfSalt } from "@/lib/nostr";
import { bytesToHex } from "@stacks/common";
import { Fingerprint, Loader2, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PasskeyAuthProps {
  onAuthenticated: (username: string) => void;
}

export const PasskeyAuth = ({ onAuthenticated }: PasskeyAuthProps) => {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  // True when localStorage holds a partial passkey (e.g. a credential id but
  // no public key) — the passkey must be created again, not just authenticated.
  const [needsRecreate, setNeedsRecreate] = useState(false);
  const [npub, setNpub] = useState<string | null>(null);

  const deriveNpubFromAssertion = (
    credential: PublicKeyCredential
  ): string | null => {
    const ext = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };
    const prf = ext.prf?.results?.first;
    if (!prf) {
      console.warn("PRF output not available — cannot derive Nostr key");
      return null;
    }
    try {
      const key = deriveNostrKeyFromPrf(new Uint8Array(prf));
      return getNpub(key);
    } catch (err) {
      console.error("Failed to derive Nostr key:", err);
      return null;
    }
  };

  const createPasskey = async () => {
    if (!username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    setIsLoading(true);
    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        toast.error("Passkeys are not supported on this device");
        return;
      }

      // Determine the correct rp.id based on environment
      let rpId = window.location.hostname;

      // Handle localhost variations
      if (rpId === "127.0.0.1" || rpId === "::1" || rpId.includes(":")) {
        rpId = "localhost";
      }

      // Remove port if present
      rpId = rpId.split(":")[0];

      console.log("Creating passkey with rp.id:", rpId);

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions =
        {
          challenge,
          rp: {
            name: "STX Transfer",
            id: rpId,
          },
          user: {
            id: userId,
            name: username,
            displayName: username,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            // "required" so the credential is provisioned for user
            // verification (biometric / PIN) - the contract enforces the
            // signed UV flag on every transfer.
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        };

      // Request the PRF extension so the passkey can later derive a Nostr
      // identity for transfer announcements. Harmless if unsupported.
      (publicKeyCredentialCreationOptions as { extensions?: unknown }).extensions =
        { prf: { eval: { first: nostrPrfSalt() } } };

      const credential = (await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      })) as PublicKeyCredential;

      if (credential) {
        const attestationResponse = credential.response as AuthenticatorAttestationResponse;
        const authenticatorDataBuffer = attestationResponse.getAuthenticatorData();
        
        // Extract the COSE public key and store its 33-byte compressed form —
        // this is what the on-chain contract uses to identify the passkey.
        const cosePublicKey = extractPublicKeyFromAuthenticatorData(authenticatorDataBuffer);
        if (!cosePublicKey) {
          throw new Error("Could not read the passkey public key");
        }
        const compressedPublicKey = coseToCompressedPublicKey(cosePublicKey);
        console.log("Compressed P-256 public key:", bytesToHex(compressedPublicKey));

        // Note whether the PRF extension is available (needed for Nostr)
        const creationExt = credential.getClientExtensionResults() as {
          prf?: { enabled?: boolean };
        };
        if (!creationExt.prf?.enabled) {
          console.warn(
            "Authenticator did not enable PRF - Nostr announcements will be unavailable"
          );
        }

        // Store credential info locally
        localStorage.setItem("stx-passkey-user", username);
        localStorage.setItem("stx-passkey-pubkey", bytesToHex(compressedPublicKey));
        // Convert rawId to base64 for storage
        const rawIdArray = new Uint8Array(credential.rawId);
        const base64Id = btoa(String.fromCharCode(...Array.from(rawIdArray)));
        localStorage.setItem("stx-passkey-id", base64Id);
        console.log("Credential created:", credential);
        console.log("Stored Credential ID (base64):", base64Id);

        toast.success("Passkey created successfully!");

        // Try to derive Nostr identity from PRF eval if available at creation.
        // If not (most authenticators only return PRF on get()), perform a
        // follow-up assertion to fetch it.
        let derived = deriveNpubFromAssertion(credential);
        if (!derived) {
          try {
            const follow = (await navigator.credentials.get({
              publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [
                  { id: credential.rawId, type: "public-key", transports: ["internal"] },
                ],
                userVerification: "required",
                timeout: 60000,
                extensions: { prf: { eval: { first: nostrPrfSalt() } } },
              } as PublicKeyCredentialRequestOptions,
            })) as PublicKeyCredential | null;
            if (follow) derived = deriveNpubFromAssertion(follow);
          } catch (err) {
            console.warn("PRF follow-up assertion failed:", err);
          }
        }
        if (derived) setNpub(derived);

        onAuthenticated(username);
      }
    } catch (error) {
      console.error("Passkey creation error:", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error("Passkey creation was cancelled");
      } else {
        toast.error("Failed to create passkey: " + getErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const authenticateWithPasskey = async () => {
    setIsLoading(true);
    try {
      const storedUsername = localStorage.getItem("stx-passkey-user");
      const storedCredentialId = localStorage.getItem("stx-passkey-id");
      const storedPublicKey = localStorage.getItem("stx-passkey-pubkey");

      if (!storedUsername || !storedCredentialId) {
        toast.error("No passkey found. Please create one first.");
        setHasPasskey(false);
        return;
      }

      // The public key is captured only when a passkey is created — an
      // assertion cannot recover it. Without it a transfer cannot be built,
      // so send the user back to the create flow.
      if (!storedPublicKey) {
        toast.error("Your saved passkey is incomplete. Please create it again.");
        setHasPasskey(false);
        setNeedsRecreate(true);
        return;
      }

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      console.log("Stored Credential ID:", storedCredentialId);

      // Convert credential ID from base64
      const credentialIdBuffer = Uint8Array.from(
        atob(storedCredentialId),
        (c) => c.charCodeAt(0)
      );

      
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions =
        {
          challenge,
          allowCredentials: [
            {
              id: credentialIdBuffer,
              type: "public-key",
              transports: ["internal"],
            },
          ],
          timeout: 60000,
          userVerification: "required",
          extensions: { prf: { eval: { first: nostrPrfSalt() } } },
        } as PublicKeyCredentialRequestOptions;

      const assertion = (await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      })) as PublicKeyCredential;

      if (assertion) {
        const derived = deriveNpubFromAssertion(assertion);
        if (derived) setNpub(derived);
        toast.success("Authentication successful!");
        onAuthenticated(storedUsername);
      }
    } catch (error) {
      console.error("Authentication error:", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error("Authentication was cancelled");
      } else {
        toast.error("Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check for a usable passkey on mount. A usable passkey needs all three
  // stored values: the username, the credential id, and the compressed public
  // key. The public key can only be captured at creation time (a WebAuthn
  // assertion never carries it), so an incomplete state must be re-created
  // rather than authenticated — otherwise the transfer step fails later.
  useEffect(() => {
    const storedUser = localStorage.getItem("stx-passkey-user");
    const storedId = localStorage.getItem("stx-passkey-id");
    const storedPubkey = localStorage.getItem("stx-passkey-pubkey");
    if (storedUser && storedId && storedPubkey) {
      setHasPasskey(true);
      setUsername(storedUser);
    } else if (storedUser || storedId || storedPubkey) {
      // Partial passkey — fall back to the create flow.
      setHasPasskey(false);
      setNeedsRecreate(true);
      if (storedUser) setUsername(storedUser);
    }
  }, []);

  return (
    <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-2">
          <Fingerprint className="w-8 h-8 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">
          {hasPasskey ? "Welcome Back" : "Secure Authentication"}
        </CardTitle>
        <CardDescription>
          {hasPasskey
            ? "Use your passkey to authenticate securely"
            : "Create a passkey to get started with STX transfers"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasPasskey && needsRecreate && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
            Your saved passkey is incomplete and can't be used to send Nothing.
            Create it again below — your authenticator may ask you to replace
            the old one.
          </div>
        )}

        {!hasPasskey && (
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && createPasskey()}
              disabled={isLoading}
            />
          </div>
        )}

        {hasPasskey && (
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">
              Authenticating as
            </p>
            <p className="font-semibold text-foreground">{username}</p>
          </div>
        )}

        <Button
          onClick={hasPasskey ? authenticateWithPasskey : createPasskey}
          className="w-full"
          variant="hero"
          size="lg"
          disabled={isLoading || (!hasPasskey && !username.trim())}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : hasPasskey ? (
            <>
              <Fingerprint className="w-4 h-4" />
              Authenticate with Passkey
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4" />
              Create Passkey
            </>
          )}
        </Button>

        {npub && (
          <div className="rounded-lg border border-border/50 bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your Nostr pubkey
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(npub);
                  toast.success("npub copied");
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Copy npub"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-mono text-xs break-all text-foreground">
              {npub}
            </p>
          </div>
        )}

        {hasPasskey && (
          <Button
            onClick={() => {
              localStorage.removeItem("stx-passkey-user");
              localStorage.removeItem("stx-passkey-id");
              localStorage.removeItem("stx-passkey-pubkey");
              setHasPasskey(false);
              setUsername("");
              toast.info("Passkey removed");
            }}
            variant="ghost"
            className="w-full text-sm"
          >
            Remove passkey and start over
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
