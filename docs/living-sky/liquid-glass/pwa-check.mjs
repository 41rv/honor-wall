import { chromium, expect } from "@playwright/test";
import {
    readStore,
    sizedFixture,
    openCreate,
    chooseTaskToday,
} from "../../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const oldBuild = "/tmp/masar-release-131-production";
const newBuild = "/tmp/masar-living-glass-production";
const root = fs.mkdtempSync("/tmp/masar-living-sky-pwa-");
const site = path.join(root, "site/honor-wall");
const profile = path.join(root, "profile");
const output = new URL("./", import.meta.url).pathname;
const base = "http://127.0.0.1:4186/honor-wall/";
const clock = "2026-10-21T09:00:00.000Z";
const stores = [
    "projects",
    "steps",
    "tasks",
    "ideas",
    "events",
    "taskCycles",
    "projectProgress",
    "projectTracking",
    "projectPlans",
    "stepWork",
    "recommendations",
    "paceSettings",
];
const options = {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
    timezoneId: "Asia/Riyadh",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
};
const errors = [],
    checks = [];
fs.mkdirSync(path.dirname(site), { recursive: true });
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
        path.join(root, "site"),
    ],
    { stdio: "ignore" },
);
let context;
const readAll = async (page) =>
    Object.fromEntries(
        await Promise.all(
            stores.map(async (store) => [store, await readStore(page, store)]),
        ),
    );
const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
};
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(base)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
    }
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    watch(page);
    await page.clock.install({ time: new Date(clock) });
    await page.goto(base);
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    await page.reload();
    const data = sizedFixture(4);
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const row of group) {
            row.createdAt = "2026-10-01T09:00:00.000Z";
            row.updatedAt = row.createdAt;
        }
    data.tasks = data.tasks.slice(0, 3);
    await page.goto(base + "#backup");
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "isolated-fixture.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const go = (hash) => page.goto(base + hash);
    await go("#tasks");
    await chooseTaskToday(page, "مهمة 0");
    await go("#tasks");
    await openCreate(page, "task", true);
    let f = page.getByRole("dialog");
    await f
        .getByLabel("الاسم", { exact: true })
        .fill("دورة محفوظة قبل التحديث");
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await f.getByLabel("الأولوية", { exact: true }).selectOption("important");
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    await page
        .getByRole("button", {
            name: "إكمال دورة محفوظة قبل التحديث",
            exact: true,
        })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.status === "completed",
                ).length,
        )
        .toBe(1);
    await go("#project/p");
    await page
        .getByRole("button", { name: "إتمام الخطوة «خطوة 0»", exact: true })
        .click();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "25",
    );
    await page
        .getByRole("button", { name: "إعداد الهدف الزمني", exact: true })
        .click();
    f = page.getByRole("dialog", { name: "هدف المشروع الزمني", exact: true });
    await f.getByLabel("نوع الهدف").selectOption("duration");
    await f.getByLabel("المدة بالأيام", { exact: true }).fill("20");
    await f.getByRole("button", { name: "حفظ الهدف", exact: true }).click();
    await expect(f).not.toBeVisible();
    await go("#backup");
    await page.locator(".project-rest-settings summary").click();
    for (const cb of await page
        .locator(".project-rest-settings")
        .getByRole("checkbox")
        .all())
        await cb.setChecked((await cb.textContent()) === "never");
    await page.getByRole("checkbox", { name: "الأحد", exact: true }).check();
    await page
        .getByRole("button", { name: "حفظ أيام الراحة", exact: true })
        .click();
    await expect(
        page.locator(".project-rest-settings").getByRole("status"),
    ).toContainText("حُفظت أيام الراحة");
    await page.evaluate(() => {
        localStorage.setItem("masar-theme", "dark");
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const before = await readAll(page);
    assert.equal(
        (await page.evaluate(() => indexedDB.databases())).find(
            (d) => d.name === "masar-v1",
        ).version,
        60,
    );
    const backupWait = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const beforeBackupPath = path.join(root, "before-update.json");
    await (await backupWait).saveAs(beforeBackupPath);
    assert.equal(
        JSON.parse(fs.readFileSync(beforeBackupPath, "utf8")).version,
        4,
    );
    const oldManifest = JSON.parse(
        fs.readFileSync(path.join(oldBuild, "manifest.webmanifest"), "utf8"),
    );
    fs.rmSync(site, { recursive: true });
    fs.cpSync(newBuild, site, { recursive: true });
    await page.evaluate(async () => {
        await (await navigator.serviceWorker.ready).update();
    });
    const update = page.getByRole("button", {
        name: "تطبيق التحديث المتاح",
        exact: true,
    });
    await update.waitFor({ timeout: 20000 });
    const loaded = page.waitForEvent("load");
    await update.click();
    await loaded;
    await expect(
        page.getByRole("heading", { name: "بياناتك في أمان", exact: true }),
    ).toBeVisible();
    assert.deepEqual(await readAll(page), before);
    checks.push("upgrade_all_12_stores_exactly_preserved");
    assert.equal(
        (await page.evaluate(() => indexedDB.databases())).find(
            (d) => d.name === "masar-v1",
        ).version,
        60,
    );
    checks.push("no_database_version_change_60_to_60");
    assert.deepEqual(
        JSON.parse(
            fs.readFileSync(
                path.join(newBuild, "manifest.webmanifest"),
                "utf8",
            ),
        ),
        oldManifest,
    );
    checks.push("manifest_identity_scope_start_url_unchanged");
    await go("#today");
    await expect(page.locator(".daily-picker,.daily-remove")).toHaveCount(0);
    await expect(page.locator(".today-ordered .task-main strong")).toHaveText([
        "مهمة 0",
        "دورة محفوظة قبل التحديث",
    ]);
    checks.push("new_order_and_existing_cycle_completed_after_update");
    await expect(page.locator(".living-sky")).toBeAttached();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(12px)");
    checks.push("living_sky_default12_existing_theme_preserved");
    await page
        .getByRole("button", { name: "إجراءات المهمة «مهمة 0»", exact: true })
        .click();
    await expect(
        page
            .getByRole("dialog")
            .getByRole("button", { name: "إزالة من مهامي اليوم", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await go("#tasks");
    await chooseTaskToday(page, "مهمة 1");
    await chooseTaskToday(page, "مهمة 2");
    await go("#home");
    await expect(page.locator(".home-today .task-main strong")).toHaveText([
        "مهمة 0",
        "مهمة 1",
        "مهمة 2",
    ]);
    await page
        .getByRole("button", { name: "إكمال مهمة 0", exact: true })
        .click();
    await page.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await expect(
        page.locator(".today-ordered .task-main strong").last(),
    ).toHaveText("مهمة 0");
    await page
        .getByRole("button", { name: "إعادة فتح مهمة 0", exact: true })
        .click();
    await expect(page.locator(".today-ordered .task-main strong")).toHaveText([
        "مهمة 0",
        "مهمة 1",
        "مهمة 2",
        "دورة محفوظة قبل التحديث",
    ]);
    checks.push("menu_selection_complete_undo_compact_expanded");
    await page
        .getByRole("button", {
            name: "إعادة فتح دورة محفوظة قبل التحديث",
            exact: true,
        })
        .click();
    await expect(
        page.locator(".today-ordered .task-main strong").first(),
    ).toHaveText("دورة محفوظة قبل التحديث");
    await page
        .getByRole("button", {
            name: "إكمال دورة محفوظة قبل التحديث",
            exact: true,
        })
        .click();
    await expect(
        page.getByRole("button", {
            name: "إعادة فتح دورة محفوظة قبل التحديث",
            exact: true,
        }),
    ).toHaveAttribute("aria-busy", "false");
    assert.equal((await readStore(page, "taskCycles")).length, 1);
    checks.push("recurring_undo_recomplete_same_cycle");
    await go("#backup");
    const exportWait = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const afterBackupPath = path.join(root, "after-update.json");
    await (await exportWait).saveAs(afterBackupPath);
    const snapshot = JSON.parse(fs.readFileSync(afterBackupPath, "utf8"));
    assert.equal(snapshot.version, 4);
    const saved = await readAll(page);
    await page
        .getByLabel("استيراد نسخة", { exact: true })
        .setInputFiles(afterBackupPath);
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    // JSON intentionally omits optional properties whose value is undefined.
    assert.deepEqual(
        JSON.parse(JSON.stringify(await readAll(page))),
        JSON.parse(JSON.stringify(saved)),
    );
    checks.push("backup_v4_restores_all_12_stores_json_values");
    const expectedEntries = [
        ...fs
            .readFileSync(path.join(newBuild, "index.html"), "utf8")
            .matchAll(
                /(?:src|href)="([^"]*\/assets\/index-[^"]+\.(?:js|css))"/g,
            ),
    ]
        .map((m) => m[1])
        .sort();
    const cached = await page.evaluate(async () => ({
        controlled: !!navigator.serviceWorker.controller,
        urls: (
            await Promise.all(
                (await caches.keys()).map(async (name) =>
                    (await (await caches.open(name)).keys()).map(
                        (r) => new URL(r.url).pathname,
                    ),
                ),
            )
        ).flat(),
    }));
    assert.equal(cached.controlled, true);
    assert.deepEqual(
        cached.urls
            .filter((p) => /\/assets\/index-[^/]+\.(?:js|css)$/.test(p))
            .sort(),
        expectedEntries,
    );
    checks.push("cache_only_current_js_css");
    await go("#today");
    await page
        .getByRole("button", { name: "المظهر والألوان", exact: true })
        .click();
    const appearance = page.getByRole("dialog", {
        name: "المظهر والألوان",
        exact: true,
    });
    await appearance
        .getByRole("slider", { name: "ضبابية الخلفية", exact: true })
        .fill("27");
    await appearance.getByRole("button", { name: "تم", exact: true }).click();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(27px)");
    await page.screenshot({
        path: path.join(output, "pwa-updated-390-dark.png"),
        fullPage: true,
    });
    const restartData = await readAll(page);
    await context.close();
    context = null;
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    page = await context.newPage();
    watch(page);
    await page.clock.install({ time: new Date("2026-10-21T20:00:00Z") });
    await page.goto(base + "#today");
    await expect(page.locator(".today-ordered .task-row")).toHaveCount(4);
    assert.deepEqual(await readAll(page), restartData);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(27px)");
    await expect(page.locator(".living-sky")).toHaveAttribute(
        "data-phase",
        "night",
    );
    checks.push("sky_and_blur_survive_complete_browser_restart_offline");
    await page.screenshot({
        path: path.join(output, "pwa-reopened-night-offline.png"),
        fullPage: true,
    });
    await page
        .getByRole("button", { name: "إجراءات المهمة «مهمة 1»", exact: true })
        .click();
    await expect(
        page
            .getByRole("dialog")
            .getByRole("button", { name: "إزالة من مهامي اليوم", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.locator(".today-ordered .task-row")).toHaveCount(4);
    checks.push(
        "full_browser_close_restart_offline_all_12_stores_theme_and_new_menu",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
        path.join(output, "pwa-result.json"),
        JSON.stringify(
            {
                release: "Living Sky — refined glass local candidate",
                at: new Date().toISOString(),
                base,
                checks,
                checks_passed: checks.length,
                errors,
                old_deployment: "1ed2a271a776670b0a8ca3f1f816f403c6a16670",
                database_before: 60,
                database_after: 60,
                stores_before_counts: Object.fromEntries(
                    stores.map((s) => [s, before[s].length]),
                ),
                backup_restored: true,
                full_offline_browser_restart: true,
                physical_android_tested: false,
                published: false,
                blur_after_offline_restart: 27,
                isolated_profile: true,
                personal_user_data_accessed: false,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(
        "PASS PWA",
        checks.length,
        "checks; all 12 stores preserved; offline browser restart passed",
    );
} finally {
    await context?.close();
    server.kill();
}
