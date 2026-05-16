/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import {
  getClarinetVitestsArgv,
  vitestSetupFilePath,
} from "@stacks/clarinet-sdk/vitest";

// Runs the Clarity contract tests (tests/**) inside a Clarinet simnet.
export default defineConfig({
  test: {
    name: "clarity",
    environment: "clarinet",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: getClarinetVitestsArgv(),
    },
    include: ["tests/**/*.test.ts"],
  },
});
