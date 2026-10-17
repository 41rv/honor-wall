import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "../../tests/browser",
    testMatch: [
        "habits-phase4-7.spec.ts",
        "habits-phase47-edge.spec.ts",
        "internal-controls.spec.ts",
        "living-glass.spec.ts",
        "ux.spec.ts",
    ],
    timeout: 45000,
    workers: 1,
    outputDir: "/tmp/masar-phase47-edge-results",
    use: {
        baseURL: "http://127.0.0.1:4195",
        headless: true,
        launchOptions: {
            executablePath: "/usr/bin/chromium",
            args: ["--no-sandbox"],
        },
    },
    webServer: {
        command:
            "python3 -m http.server 4195 --bind 127.0.0.1 --directory /tmp/masar-phase47-final-root",
        url: "http://127.0.0.1:4195",
        cwd: "/workspace/honor-wall",
        reuseExistingServer: false,
    },
});
