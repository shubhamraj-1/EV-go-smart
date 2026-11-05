import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "modules/**/*.test.ts",
      "modules/**/*.test.tsx",
    ],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share one local Supabase DB; parallel files would
    // interleave (e.g. a van available in dispatch.test vs. the Phase 1
    // "stays requested" expectation). Keep files serialized.
    fileParallelism: false,
    sequence: { shuffle: false },
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
