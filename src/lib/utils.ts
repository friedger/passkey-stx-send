import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) {
    return error.message;
  }
  return String(error);
}
