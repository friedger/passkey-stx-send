import { useState } from 'react';
import { PasskeyAuth } from '@/components/PasskeyAuth';
import { NothingTransfer } from '@/components/NothingTransfer';
import { Ghost } from 'lucide-react';

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState<any>(null);

  const handleAuthenticated = (user: string, cred: any) => {
    setUsername(user);
    setCredential(cred);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername('');
    setCredential(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg mb-4">
            <Ghost className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Send Nothing
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Give someone absolutely Nothing using their BNS name
          </p>
          <p className="text-sm text-muted-foreground/70">
            Because sometimes, Nothing is exactly what they need
          </p>
        </div>

        {/* Main Content */}
        <div className="flex items-center justify-center">
          {!isAuthenticated ? (
            <PasskeyAuth onAuthenticated={handleAuthenticated} />
          ) : (
            <NothingTransfer 
              username={username} 
              credential={credential}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>Secured with WebAuthn passkeys • Powered by NOT tokens on Stacks</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
