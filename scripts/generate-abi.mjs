/**
 * Derive the TypeScript ABI for passkey-not-sender from the contract source.
 *
 * Boots a Clarinet simnet, reads the canonical contract interface, and writes
 * it as an `as const` object so clarity-abitype can infer types from it.
 *
 * The ABI is written to two places:
 *  - src/contracts/        for the frontend
 *  - supabase/functions/   for the edge function (deployed as a self-contained
 *                          bundle, so it cannot import across the repo)
 *
 * Run with: npm run gen:abi
 */
import { initSimnet } from "@stacks/clarinet-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const simnet = await initSimnet();
const interfaces = simnet.getContractsInterfaces();

let abi = null;
for (const [id, iface] of interfaces) {
  if (id.endsWith(".passkey-not-sender")) abi = iface;
}

if (!abi) {
  throw new Error(
    `passkey-not-sender not found. Contracts: ${[...interfaces.keys()].join(", ")}`
  );
}

// clarity-abitype 0.6.0's ClarityVersion union predates Clarity 5; drop the
// field (it is optional in the ABI) so the const still satisfies `ClarityAbi`.
const abiOut = JSON.parse(JSON.stringify(abi));
delete abiOut.clarity_version;

const content =
  "// AUTO-GENERATED from contracts/passkey-not-sender.clar - do not edit by hand.\n" +
  "// Regenerate with: npm run gen:abi\n\n" +
  `export const passkeyNotSenderAbi = ${JSON.stringify(abiOut, null, 2)} as const;\n`;

const targets = [
  "src/contracts/passkey-not-sender-abi.ts",
  "supabase/functions/submit-not-transfer/passkey-not-sender-abi.ts",
];

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`Wrote ${target}`);
}
