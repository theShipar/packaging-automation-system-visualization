import { defineConfig } from '@playwright/test';

/** Browser checks run against a private dev server on 5181 so the user's 5180 server is untouched. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts/,
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5181',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'npx vite --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181/production',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
