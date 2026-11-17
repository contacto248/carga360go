import { defineConfig } from "@playwright/test";

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * E2E local. CI no ejecuta este config ni instala browser.
 * baseURL por defecto: dev en 127.0.0.1. La sesión solo entra por STORAGE_STATE.
 */
const storageState = envText("STORAGE_STATE");

export default defineConfig({
  testDir: "./e2e",
  retries: 2,
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: "line",
  use: {
    baseURL: envText("PLAYWRIGHT_BASE_URL") ?? "http://127.0.0.1:4317",
    ...(storageState ? { storageState } : {}),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
