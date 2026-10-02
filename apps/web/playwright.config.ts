import { defineConfig, devices } from "@playwright/test";

// E2E chạy trên stack thật (API + web + Postgres). Mặc định trỏ Vite dev ở 5173;
// `make e2e` đặt E2E_BASE_URL=http://localhost:8081 (compose profile "full").
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Cài đặt "tạm ngưng nhận đơn" là trạng thái chung → chạy tuần tự để spec không giẫm nhau.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
