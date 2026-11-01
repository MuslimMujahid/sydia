import { defineConfig, devices } from "@playwright/test";

// Exercises an already-running development stack, including its real saved data.
// Start with `bun run dev` and the demo seed; fixtures only delete notes they create.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "record-notes.spec.ts",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
