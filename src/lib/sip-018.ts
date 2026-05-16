import {
  ClarityValue,
  serializeCVBytes,
  stringAsciiCV,
  tupleCV,
  uintCV
} from "@stacks/transactions";

const structuredDataPrefix = new Uint8Array([
  0x53, 0x49, 0x50, 0x30, 0x31, 0x38,
]);

const chainIds = {
  mainnet: 1,
  testnet: 2147483648,
};

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Create a new ArrayBuffer to ensure compatibility with Web Crypto API
  const buffer = new ArrayBuffer(data.byteLength);
  const view = new Uint8Array(buffer);
  view.set(data);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hash);
}

async function structuredDataHash(structuredData: ClarityValue): Promise<Uint8Array> {
  return sha256(serializeCVBytes(structuredData));
}

export async function createMessage(structuredData: ClarityValue): Promise<Uint8Array> {
  const domainHash = await structuredDataHash(
    tupleCV({
      name: stringAsciiCV("send-nothing"),
      version: stringAsciiCV("1.0.0"),
      "chain-id": uintCV(chainIds.mainnet),
    })
  );

  const messageHash = await structuredDataHash(structuredData);

  const input = await sha256(
    new Uint8Array([...structuredDataPrefix, ...domainHash, ...messageHash])
  );
  return input;
}
