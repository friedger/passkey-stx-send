import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Passkey Storage and Retrieval', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Encoding and Decoding Credential ID', () => {
    it('should encode rawId to base64 and decode it back to the same value', () => {
      // Create a mock credential ID (32 bytes)
      const mockRawId = crypto.getRandomValues(new Uint8Array(32));

      // Encode to base64 (like PasskeyAuth.tsx does)
      const base64Id = btoa(String.fromCharCode(...mockRawId));

      // Decode back (like not-token-service.ts does)
      const credentialIdBuffer = Uint8Array.from(atob(base64Id), (c) =>
        c.charCodeAt(0)
      );

      // Should match the original
      expect(credentialIdBuffer).toEqual(mockRawId);
    });

    it('should handle credential IDs of various lengths', () => {
      const testLengths = [16, 32, 64, 128];

      testLengths.forEach((length) => {
        const mockRawId = crypto.getRandomValues(new Uint8Array(length));
        const base64Id = btoa(String.fromCharCode(...mockRawId));
        const decoded = Uint8Array.from(atob(base64Id), (c) =>
          c.charCodeAt(0)
        );

        expect(decoded).toEqual(mockRawId);
      });
    });
  });
});
