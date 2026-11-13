import { defineConfig, devices } from "@playwright/test";

// With BASE_URL set (e.g. a Netlify deploy preview) test that site;
// otherwise build and serve the site locally on port 8080.
const baseURL = process.env.BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "tests",
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run preview",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
