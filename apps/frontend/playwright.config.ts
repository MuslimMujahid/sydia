import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const backendURL =
  process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:5000";

const frontendPort = new URL(baseURL).port || "3000";
const backendPort = new URL(backendURL).port || "5000";

const backendEnvironment = {
  NODE_ENV: "test",
  BACKEND_RESEND_API_KEY: "re_playwright_fixture",
  BACKEND_MAIL_FROM: "Sydia <no-reply@sydia.id>",
  BACKEND_PORT: backendPort,
  FRONTEND_PORT: frontendPort,
  FRONTEND_URL: baseURL,
  BACKEND_AUTH_URL: backendURL,
  BACKEND_AUTH_SECRET:
    process.env.BACKEND_AUTH_SECRET ??
    "playwright-local-auth-secret-at-least-32-characters",
  BACKEND_DB_URL:
    process.env.BACKEND_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/app",
  BACKEND_SECRET_ENCRYPTION_KEY:
    process.env.BACKEND_SECRET_ENCRYPTION_KEY ??
    "playwright-local-secret-encryption-key-at-least-32-characters",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "bun run build && node --import ../frontend/e2e/resend-fixture.mjs dist/src/main.js",
      cwd: "../backend",
      url: `${backendURL}/`,
      timeout: 120_000,
      // Always launch the backend with the local Resend fixture.
      reuseExistingServer: false,
      env: backendEnvironment,
    },
    {
      command: "bun run dev -- --host 127.0.0.1",
      cwd: ".",
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        FRONTEND_URL: baseURL,
        VITE_API_URL: backendURL,
      },
    },
  ],
});
