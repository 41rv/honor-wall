import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const basePath = process.env.MASAR_E2E_BASE_PATH ?? "/";
const baseURL = "http://127.0.0.1:4173" + basePath;
export default defineConfig({
    testDir: "tests/browser",
    timeout: 45000,
    workers: 1,
    use: {
        baseURL,
        headless: true,
        launchOptions: existsSync("/usr/bin/chromium")
            ? { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }
            : {},
    },
    webServer: {
        command: "npm run preview -- --port 4173 --strictPort",
        url: baseURL,
        reuseExistingServer: false,
    },
});
