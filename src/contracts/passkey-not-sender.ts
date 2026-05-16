/**
 * Typed interface for the passkey-not-sender contract.
 *
 * `passkeyNotSenderAbi` is generated from the contract source (`npm run gen:abi`).
 * clarity-abitype derives the TypeScript types below from it via type inference
 * - no code generation step.
 */
import type {
  ClarityAbiArgsToPrimitiveTypes,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from "clarity-abitype";
import { passkeyNotSenderAbi } from "./passkey-not-sender-abi";

export { passkeyNotSenderAbi };

/** Contract name (without the deployer prefix). */
export const PASSKEY_NOT_SENDER_CONTRACT = "passkey-not-sender";

/** The contract's ABI type. */
export type PasskeyNotSenderAbi = typeof passkeyNotSenderAbi;

/** Names of the contract's public (state-changing) functions. */
export type PublicFunctionName = ExtractAbiFunctionNames<
  PasskeyNotSenderAbi,
  "public"
>;

/** Names of the contract's read-only functions. */
export type ReadOnlyFunctionName = ExtractAbiFunctionNames<
  PasskeyNotSenderAbi,
  "read_only"
>;

/** Argument tuple (as TypeScript primitives) for any public function. */
export type PublicFunctionArgs<name extends PublicFunctionName> =
  ClarityAbiArgsToPrimitiveTypes<
    ExtractAbiFunction<PasskeyNotSenderAbi, name>["args"]
  >;

/**
 * Argument tuple for `transfer-not`, e.g.
 * `[publicKey, amount, recipient, memo, nonce, authData, prefix, suffix, sig]`.
 */
export type TransferNotArgs = PublicFunctionArgs<"transfer-not">;
