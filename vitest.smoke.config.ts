import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Config for `npm run smoke:ai` only.
 *
 * The smoke test has to build its request through the real prompt and retrieval
 * modules -- the previous standalone script kept its own copy of the prompt and
 * sent no framework context at all, so it passed while proving nothing about the
 * knowledge base. Importing the real modules means resolving `@/` and stubbing
 * `server-only`, which is what a Vitest config already does.
 *
 * Kept separate from vitest.config.ts so a real model call never runs as part of
 * `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/smoke-ai.test.ts"],
    // One real model call, with thinking budget; the default 5s is not enough.
    testTimeout: 120_000,
  },
});
