# Passkey Authentication Tests

This document describes the test suite for passkey storage and retrieval functionality.

## Overview

The test suite (`src/__tests__/passkey-auth.test.ts`) verifies that:
1. Passkey credential IDs can be properly encoded to base64 and decoded back

## Running the Tests

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test -- --run

# Run tests with UI
pnpm test:ui
```

## Key Implementation Details

### Encoding Process (Registration)
```typescript
const rawIdBuffer = new Uint8Array(credential.rawId);
const base64Id = btoa(String.fromCharCode(...rawIdBuffer));
localStorage.setItem('stx-passkey-id', base64Id);
```

### Decoding Process (Login)
```typescript
const storedCredentialId = localStorage.getItem('stx-passkey-id');
const credentialIdBuffer = Uint8Array.from(atob(storedCredentialId), (c) =>
  c.charCodeAt(0)
);
```
