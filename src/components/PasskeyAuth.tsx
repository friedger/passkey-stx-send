import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Fingerprint, Loader2 } from 'lucide-react';

interface PasskeyAuthProps {
  onAuthenticated: (username: string, credential: any) => void;
}

export const PasskeyAuth = ({ onAuthenticated }: PasskeyAuthProps) => {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  const createPasskey = async () => {
    if (!username.trim()) {
      toast.error('Please enter a username');
      return;
    }

    setIsLoading(true);
    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        toast.error('Passkeys are not supported on this device');
        return;
      }

      // Determine the correct rp.id based on environment
      let rpId = window.location.hostname;
      
      // Handle localhost variations
      if (rpId === '127.0.0.1' || rpId === '::1' || rpId.includes(':')) {
        rpId = 'localhost';
      }
      
      // Remove port if present
      rpId = rpId.split(':')[0];

      console.log('Creating passkey with rp.id:', rpId);

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'STX Transfer',
          id: rpId,
        },
        user: {
          id: userId,
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          userVerification: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential;

      if (credential) {
        // Store credential info locally
        localStorage.setItem('stx-passkey-user', username);
        localStorage.setItem('stx-passkey-id', credential.id);
        
        toast.success('Passkey created successfully!');
        onAuthenticated(username, credential);
      }
    } catch (error: any) {
      console.error('Passkey creation error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Passkey creation was cancelled');
      } else {
        toast.error('Failed to create passkey: ' + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const authenticateWithPasskey = async () => {
    setIsLoading(true);
    try {
      const storedUsername = localStorage.getItem('stx-passkey-user');
      const storedCredentialId = localStorage.getItem('stx-passkey-id');

      if (!storedUsername || !storedCredentialId) {
        toast.error('No passkey found. Please create one first.');
        setHasPasskey(false);
        return;
      }

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Convert credential ID from base64
      const credentialIdBuffer = Uint8Array.from(atob(storedCredentialId), c => c.charCodeAt(0));

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials: [{
          id: credentialIdBuffer,
          type: 'public-key',
          transports: ['internal'],
        }],
        timeout: 60000,
        userVerification: 'required',
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      }) as PublicKeyCredential;

      if (assertion) {
        toast.success('Authentication successful!');
        onAuthenticated(storedUsername, assertion);
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Authentication was cancelled');
      } else {
        toast.error('Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user has a passkey on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('stx-passkey-user');
    if (storedUser) {
      setHasPasskey(true);
      setUsername(storedUser);
    }
  }, []);

  return (
    <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-2">
          <Fingerprint className="w-8 h-8 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">
          {hasPasskey ? 'Welcome Back' : 'Secure Authentication'}
        </CardTitle>
        <CardDescription>
          {hasPasskey 
            ? 'Use your passkey to authenticate securely'
            : 'Create a passkey to get started with STX transfers'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasPasskey && (
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createPasskey()}
              disabled={isLoading}
            />
          </div>
        )}

        {hasPasskey && (
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Authenticating as</p>
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

        {hasPasskey && (
          <Button
            onClick={() => {
              localStorage.removeItem('stx-passkey-user');
              localStorage.removeItem('stx-passkey-id');
              setHasPasskey(false);
              setUsername('');
              toast.info('Passkey removed');
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
