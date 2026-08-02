import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    // Suites that own a database run `prisma migrate deploy` in beforeAll;
    // applying the full migration history exceeds the 10s default.
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
});
