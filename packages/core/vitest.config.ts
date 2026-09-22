import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.browser.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/**/*.browser.test.ts"],
          // The loop-seam tests render a few hundred frames each; ~3s on a
          // laptop, but CI runs on a shared runner with software GL and has
          // gone past the 15s default.
          testTimeout: 90_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
