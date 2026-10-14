import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readStore } from "../tests/browser/helpers.ts";

const newBuild =
    process.argv[2] || new URL("../build", import.meta.url).pathname;
const oldBuild = process.argv[3] || "/tmp/masar-release-104";
const basePath = process.argv[4] || "/";
const reportPath = process.argv[5] || "docs/ux/pwa-result.json";
const root = fs.mkdtempSync("/tmp/masar-qa-pwa-");
const site = root + "/site" + basePath;
const profile = root + "/isolated-browser-profile";
fs.mkdirSync(site, { recursive: true });
fs.cpSync(oldBuild, site, { recursive: true });
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4186",
        "--bind",
        "127.0.0.1",
        "--directory",
        root + "/site",
    ],
    { stdio: "ignore" },
);
const baseURL = "http://127.0.0.1:4186" + basePath;
let context;
const errors = [];
const options = {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
    baseURL,
    timezoneId: "Asia/Riyadh",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
};
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(baseURL)).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    const recordErrors = (target) => {
        target.on("pageerror", (error) => errors.push(error.message));
        target.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
    };
    recordErrors(page);
    await page.goto(baseURL);
    await page.getByLabel("عنوان الفكرة السريعة").waitFor();
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload();
    async function add(button, title, notes = "") {
        await page.getByRole("button", { name: button, exact: true }).tap();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("الاسم", { exact: true }).fill(title);
        await dialog.getByRole("textbox").nth(1).fill(notes);
        await dialog.getByRole("button", { name: "إضافة", exact: true }).tap();
        await expect(dialog).not.toBeVisible();
    }
    await page.goto(baseURL + "#tasks");
    await add("مهمة جديدة", "مهمة تجريبية قبل التدقيق", "ملاحظات مهمة محفوظة");
    await page.goto(baseURL + "#projects");
    await add("مشروع جديد", "مشروع تجريبي قبل التدقيق", "ملاحظات مشروع محفوظة");
    await page
        .getByRole("button", { name: "مشروع تجريبي قبل التدقيق", exact: true })
        .tap();
    const projectRoute = new URL(page.url()).hash;
    await add("خطوة", "خطوة تجريبية", "ملاحظات خطوة محفوظة");
    await add("خطوة", "خطوة باقية");
    await page
        .getByRole("button", {
            name: "إتمام الخطوة «خطوة تجريبية»",
            exact: true,
        })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    const before = {};
    const beforeDatabases = await page.evaluate(() => indexedDB.databases());
    for (const store of ["projects", "steps", "tasks", "ideas", "events"])
        before[store] = await readStore(page, store);
    await page.goto(baseURL + "#backup");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).tap();
    await (await downloaded).saveAs(root + "/demo-backup-before-update.json");

    fs.cpSync(newBuild, site, { recursive: true });
    await page.evaluate(
        async () => await (await navigator.serviceWorker.ready).update(),
    );
    await page
        .getByRole("button", { name: "تطبيق التحديث المتاح", exact: true })
        .waitFor({ timeout: 15000 });
    const loaded = page.waitForEvent("load");
    await page
        .getByRole("button", { name: "تطبيق التحديث المتاح", exact: true })
        .tap();
    await loaded;
    await page.getByRole("heading", { name: "بياناتك في أمان" }).waitFor();
    for (const store of ["projects", "steps", "tasks", "ideas", "events"])
        assert.deepEqual(await readStore(page, store), before[store]);
    const manifest = await (
        await page.request.get(baseURL + "manifest.webmanifest")
    ).json();
    assert.equal(manifest.lang, "ar");
    assert.equal(manifest.dir, "rtl");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, basePath);
    assert.equal(manifest.scope, basePath);
    for (const icon of manifest.icons)
        assert.equal(
            (
                await page.request.get("http://127.0.0.1:4186" + icon.src)
            ).status(),
            200,
        );
    const cached = await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const names = await caches.keys();
        return {
            controlled: !!navigator.serviceWorker.controller,
            scope: registrations[0].scope,
            databases: await indexedDB.databases(),
            cacheNames: names,
            cachedURLs: (
                await Promise.all(
                    names.map(async (name) =>
                        (await (await caches.open(name)).keys()).map(
                            (request) => request.url,
                        ),
                    ),
                )
            ).flat(),
        };
    });
    assert.equal(cached.controlled, true);
    assert.equal(
        cached.databases.find((database) => database.name === "masar-v1")
            .version,
        beforeDatabases.find((database) => database.name === "masar-v1")
            .version,
    );
    assert(
        cached.cachedURLs.some((url) =>
            new URL(url).pathname.endsWith("/index.html"),
        ),
    );
    assert(
        cached.cachedURLs.some((url) =>
            new URL(url).pathname.endsWith(".woff2"),
        ),
    );
    await page.goto(baseURL + "#tasks");
    await page
        .getByRole("button", {
            name: "إكمال مهمة تجريبية قبل التدقيق",
            exact: true,
        })
        .evaluate((button) => {
            for (let i = 0; i < 10; i++) button.click();
        });
    await expect
        .poll(async () => (await readStore(page, "tasks"))[0].status)
        .toBe("todo");
    await page.goto(baseURL + projectRoute);
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظات مشروع محفوظة",
    );
    await page
        .getByRole("button", { name: "خطوة باقية خطوة", exact: true })
        .tap();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("خطوة باقية");
    const rememberedRoute = new URL(page.url()).hash;
    await page.getByRole("button", { name: "المظهر والألوان" }).tap();
    await page.getByLabel("الهوية", { exact: true }).selectOption("mono");
    await page.getByLabel("الوضع", { exact: true }).selectOption("dark");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تم", exact: true })
        .tap();
    await page.goto(baseURL + projectRoute);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظات مشروع محفوظة",
    );
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    page = await context.newPage();
    recordErrors(page);
    await page.goto(baseURL + projectRoute);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظات مشروع محفوظة",
    );
    assert.deepEqual(
        (await readStore(page, "projects")).map((project) => project.id),
        before.projects.map((project) => project.id),
    );
    await page.goto(baseURL + "#home");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-identity", "mono");
    await page
        .getByRole("button", { name: "أكمل من حيث توقفت", exact: true })
        .tap();
    assert.equal(new URL(page.url()).hash, rememberedRoute);
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("خطوة باقية");
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                basePath,
                update_preserved_all_five_stores: true,
                backup_created: true,
                repeated_toggle_after_update: true,
                offline_reload: true,
                browser_closed_and_reopened_offline: true,
                remembered_step_and_theme_survived_browser_restart: true,
                manifest,
                ...cached,
                errors,
                limitations: [
                    "Physical Android installation and Safari/iOS are not tested.",
                ],
            },
            null,
            2,
        ) + "\n",
    );
    console.log(
        "PASS: PWA update preserves every store, manifest/icons/cache valid, latest toggle saved, offline reload and full browser restart preserve data",
    );
} finally {
    await context?.close();
    server.kill();
}
