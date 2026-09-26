import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "npm --prefix ../backend run build && npm --prefix ../backend start",
      url: "http://localhost:3101/health",
      env: {
        PORT: "3101",
        DATABASE_PATH: ":memory:",
        DOTENV_CONFIG_PATH: "/dev/null",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { API_PROXY_TARGET: "http://localhost:3101" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
