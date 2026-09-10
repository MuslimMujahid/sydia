import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const backendURL =
  process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:5000";

const frontendPort = new URL(baseURL).port || "3000";
const backendPort = new URL(backendURL).port || "5000";

const backendEnvironment = {
  BACKEND_PORT: backendPort,
  FRONTEND_PORT: frontendPort,
  FRONTEND_URL: baseURL,
  BACKEND_AUTH_URL: backendURL,
  BACKEND_AUTH_SECRET:
    process.env.BACKEND_AUTH_SECRET ??
    "playwright-local-auth-secret-at-least-32-characters",
  BACKEND_DB_HOST: process.env.BACKEND_DB_HOST ?? "127.0.0.1",
  BACKEND_DB_PORT: process.env.BACKEND_DB_PORT ?? "5432",
  BACKEND_DB_USER: process.env.BACKEND_DB_USER ?? "postgres",
  BACKEND_DB_PASSWORD: process.env.BACKEND_DB_PASSWORD ?? "postgres",
  BACKEND_DB_NAME: process.env.BACKEND_DB_NAME ?? "app",
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
      command: "bun run start",
      cwd: "../backend",
      url: `${backendURL}/`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
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
