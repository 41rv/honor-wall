import { defineConfig } from "@playwright/test";
// Isolated final candidate on a second local port; the production build and
// test output directory are separate from the concurrent regression run.
export default defineConfig({
    testDir: "../../tests/browser",
    timeout: 45000,
    workers: 1,
    outputDir: "/tmp/masar-phase3-final-playwright-results",
    use: {
        baseURL: "http://127.0.0.1:4194",
        headless: true,
        launchOptions: {
            executablePath: "/usr/bin/chromium",
            args: ["--no-sandbox"],
        },
    },
});
