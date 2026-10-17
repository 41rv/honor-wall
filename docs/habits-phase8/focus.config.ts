import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "../../tests/browser", workers: 1, timeout: 45000,
    use: { baseURL: "http://127.0.0.1:4271/honor-wall/", headless: true,
        launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] } },
    webServer: { command: "npm run preview -- --port 4271 --strictPort", url: "http://127.0.0.1:4271/honor-wall/", reuseExistingServer: false },
});
