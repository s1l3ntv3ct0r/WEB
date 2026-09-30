import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './frontend/tests', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: 'list',
});
