import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  reporter: "list",

  use: {
    baseURL,
  },

  webServer: {
    command: "npm run build && npm start",
    url: `${baseURL}/health`,
    env: {
      PORT: "3100",
      DATABASE_PATH: ":memory:",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
