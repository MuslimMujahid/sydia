import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110";
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "billing.spec.ts",
    "onboarding-billing.spec.ts",
    "account-menu.spec.ts",
    "note-drawer.spec.ts",
    "notes-move.spec.ts",
    "entity-renderer.spec.ts",
    "chat-previews.spec.ts",
    "dev-toolbar.spec.ts",
    "calendar-sync.spec.ts",
    "notification-settings.spec.ts",
  ],
  fullyParallel: true,
  retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: `bun x vite --config vite.entities.config.ts --host 127.0.0.1 --port ${new URL(baseURL).port}`,
    url: `${baseURL}/e2e/dev-toolbar.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_API_URL: "http://localhost:5000" },
  },
});
