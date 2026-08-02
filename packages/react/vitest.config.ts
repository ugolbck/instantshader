import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
