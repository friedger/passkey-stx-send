import { useState } from 'react';
import { PasskeyAuth } from '@/components/PasskeyAuth';
import { STXTransfer } from '@/components/STXTransfer';
import { Coins } from 'lucide-react';

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
            <Coins className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            STX Transfer
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Send STX tokens securely using BNSv2 names with passkey authentication
          </p>
        </div>

        {/* Main Content */}
        <div className="flex items-center justify-center">
          {!isAuthenticated ? (
            <PasskeyAuth onAuthenticated={handleAuthenticated} />
          ) : (
            <STXTransfer 
              username={username} 
              credential={credential}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>Secured with WebAuthn passkeys • Powered by Stacks blockchain</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
