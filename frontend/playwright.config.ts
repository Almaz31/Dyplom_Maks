import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8002",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
  timeout: 45000,
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: '"..\\.venv\\Scripts\\python.exe" "../scripts/serve_e2e.py"',
        url: "http://127.0.0.1:8002/api/health",
        reuseExistingServer: false,
        timeout: 30000,
      },
});
