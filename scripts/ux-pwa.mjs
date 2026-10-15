import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readStore, openCreate } from "../tests/browser/helpers.ts";

const newBuild =
    process.argv[2] || new URL("../build", import.meta.url).pathname;
const oldBuild = process.argv[3] || "/tmp/masar-release-104";
const basePath = process.argv[4] || "/";
const tasksMode = process.argv[7] === "tasks";
const preexistingTasks = process.argv[8] === "preexisting-tasks";
const planningMode = process.argv[9] === "planning";
const darkAudit = process.argv[10] === "dark-audit";
const paceMode = process.argv[11] === "pace";
const restartStores = [
    "projects",
    "steps",
    "tasks",
    "ideas",
    "events",
    "taskCycles",
    ...(planningMode ? ["projectProgress", "projectTracking"] : []),
    ...(paceMode
        ? ["projectPlans", "stepWork", "recommendations", "paceSettings"]
        : []),
];
let schedulingData, recurringId;
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
        } catch {
            // Retry while the local test server starts.
        }
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
    await page.locator("h1").waitFor();
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload();
    async function add(button, title, notes = "") {
        await page.locator("h1").waitFor();
        const control = page.getByRole("button", { name: button, exact: true });
        const kind = {
            "مشروع جديد": "project",
            "مهمة جديدة": "task",
            "فكرة جديدة": "idea",
        }[button];
        if (!kind || (await control.isVisible())) await control.tap();
        else await openCreate(page, kind, true);
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
    const preservedStores = ["projects", "steps", "tasks", "ideas", "events"];
    if (
        planningMode &&
        (await page.evaluate(() => indexedDB.databases())).find(
            (d) => d.name === "masar-v1",
        )?.version >= 40
    )
        preservedStores.push("projectProgress", "projectTracking");
    if (preexistingTasks) {
        await page.goto(baseURL + "#tasks");
        const oldCreate = page.getByRole("button", {
            name: "مهمة جديدة",
            exact: true,
        });
        if (await oldCreate.isVisible()) await oldCreate.tap();
        else await openCreate(page, "task", true);
        const form = page.getByRole("dialog");
        await form
            .getByLabel("الاسم", { exact: true })
            .fill("دورة محفوظة قبل المراجعة");
        await form.getByRole("textbox").nth(1).fill("ملاحظات قبل المراجعة");
        await form.getByLabel("التكرار", { exact: true }).selectOption("daily");
        await form
            .getByLabel("الأولوية", { exact: true })
            .selectOption("important");
        await form.getByRole("button", { name: "إضافة", exact: true }).tap();
        await expect(form).not.toBeVisible();
        await page
            .getByRole("button", {
                name: "إكمال دورة محفوظة قبل المراجعة",
                exact: true,
            })
            .tap();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "taskCycles")).filter(
                        (c) => c.status === "completed",
                    ).length,
            )
            .toBe(1);
        preservedStores.push("taskCycles");
    }
    for (const store of preservedStores)
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
    for (const store of preservedStores)
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
        process.argv[6]
            ? Number(process.argv[6])
            : beforeDatabases.find((database) => database.name === "masar-v1")
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
    if (darkAudit) {
        const html = fs.readFileSync(path.join(newBuild, "index.html"), "utf8");
        const expected = [
            ...html.matchAll(
                /(?:src|href)="([^"]*\/assets\/index-[^"]+\.(?:js|css))"/g,
            ),
        ]
            .map((match) => match[1])
            .sort();
        const actual = cached.cachedURLs
            .map((url) => new URL(url).pathname)
            .filter((pathname) =>
                /\/assets\/index-[^/]+\.(?:js|css)$/.test(pathname),
            )
            .sort();
        assert.equal(expected.length, 2);
        assert.deepEqual(actual, expected);
        assert.equal(manifest.background_color, "#185c4b");
    }
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
    if (tasksMode) {
        await page.clock.install({ time: new Date("2026-10-17T10:00:00Z") });
        await page.goto(baseURL + "#tasks");
        await openCreate(page, "task", true);
        const form = page.getByRole("dialog");
        await form
            .getByLabel("الاسم", { exact: true })
            .fill("دورة يومية بعد الترحيل");
        await form.getByRole("textbox").nth(1).fill("ملاحظات دورة محفوظة");
        await form.getByLabel("التكرار", { exact: true }).selectOption("daily");
        await form
            .getByLabel("الأولوية", { exact: true })
            .selectOption("important-urgent");
        await form.getByLabel("الوقت", { exact: false }).fill("20:00");
        await form.getByRole("button", { name: "إضافة", exact: true }).tap();
        await expect(form).not.toBeVisible();
        recurringId = (await readStore(page, "tasks")).find(
            (t) => t.title === "دورة يومية بعد الترحيل",
        ).id;
        await page
            .getByRole("button", {
                name: "إكمال دورة يومية بعد الترحيل",
                exact: true,
            })
            .evaluate((button) => {
                for (let i = 0; i < 13; i++) button.click();
            });
        await expect
            .poll(
                async () =>
                    (await readStore(page, "taskCycles")).filter(
                        (c) =>
                            c.taskId === recurringId &&
                            c.status === "completed",
                    ).length,
            )
            .toBe(1);
        await page.clock.setSystemTime(new Date("2026-10-17T21:00:00Z"));
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(
            page.getByRole("button", {
                name: "إكمال دورة يومية بعد الترحيل",
                exact: true,
            }),
        ).toBeVisible();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "taskCycles")).filter(
                        (c) => c.taskId === recurringId,
                    ).length,
            )
            .toBe(2);
        if (planningMode) {
            await page.goto(baseURL + "#today");
            await page
                .getByText("اختيار مهام عامة لليوم", { exact: true })
                .tap();
            await page
                .getByRole("button", {
                    name: "إضافة «مهمة تجريبية قبل التدقيق» إلى اليوم",
                    exact: true,
                })
                .tap();
            await expect(
                page.getByRole("region", { name: "اخترتها لليوم" }),
            ).toContainText("مهمة تجريبية قبل التدقيق");
            await page.goto(baseURL + "#projects");
            await add("مشروع جديد", "مشروع التنظيم بعد الترحيل");
            const planningProjectId = (await readStore(page, "projects")).find(
                (p) => p.title === "مشروع التنظيم بعد الترحيل",
            ).id;
            await page
                .getByRole("button", {
                    name: "مشروع التنظيم بعد الترحيل",
                    exact: true,
                })
                .tap();
            await add("خطوة", "عمل مخطط");
            await add("خطوة", "عمل قادم");
            await page
                .getByRole("button", {
                    name: "إتمام الخطوة «عمل مخطط»",
                    exact: true,
                })
                .tap();
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "projectProgress")).filter(
                            (r) =>
                                r.reason === "completion" &&
                                r.projectId === planningProjectId,
                        ).length,
                )
                .toBe(1);
            if (paceMode) {
                // The former project completion stays unobserved; the new work
                // after migration has a genuine step timestamp and sequence.
                assert.equal((await readStore(page, "stepWork")).length, 1);
                await page
                    .getByRole("button", {
                        name: "إعداد الهدف الزمني",
                        exact: true,
                    })
                    .tap();
                let paceDialog = page.getByRole("dialog", {
                    name: "هدف المشروع الزمني",
                });
                await paceDialog
                    .getByLabel("نوع الهدف")
                    .selectOption("duration");
                await paceDialog
                    .getByLabel("المدة بالأيام", { exact: true })
                    .fill("20");
                await paceDialog
                    .getByRole("button", { name: "حفظ الهدف", exact: true })
                    .tap();
                await expect(paceDialog).not.toBeVisible();
                await page
                    .getByRole("button", { name: "إيقاف مؤقت", exact: true })
                    .tap();
                await page
                    .getByRole("button", { name: "تأكيد الإيقاف", exact: true })
                    .tap();
                await expect(page.getByRole("dialog")).toHaveCount(0);
                assert.equal(
                    (await readStore(page, "projectPlans")).filter(
                        (p) => p.goal && p.pauses.length,
                    ).length,
                    1,
                );
            }
            // Completing the new project's step correctly updates resume.
            // Visit the intended final location before testing its restart.
            await page.goto(baseURL + rememberedRoute);
            await expect(page.getByLabel("تعديل الاسم")).toHaveValue(
                "خطوة باقية",
            );
        }
        schedulingData = Object.fromEntries(
            await Promise.all(
                restartStores.map(async (store) => [
                    store,
                    await readStore(page, store),
                ]),
            ),
        );
    }
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    page = await context.newPage();
    recordErrors(page);
    if (tasksMode)
        await page.clock.install({ time: new Date("2026-10-17T21:00:00Z") });
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
        (planningMode ? schedulingData.projects : before.projects).map(
            (project) => project.id,
        ),
    );
    await page.goto(baseURL + "#home");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-identity", "mono");
    if (darkAudit) {
        for (const selector of ["html", "body", "#root"])
            await expect(page.locator(selector)).toHaveCSS(
                "background-color",
                "rgb(18, 18, 18)",
            );
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
            "content",
            "#121212",
        );
        await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
            "content",
            "dark",
        );
        await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    }
    await page
        .getByRole("button", { name: "أكمل من حيث توقفت", exact: true })
        .tap();
    assert.equal(new URL(page.url()).hash, rememberedRoute);
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("خطوة باقية");
    if (tasksMode) {
        await page.goto(baseURL + "#tasks");
        await expect(
            page.getByRole("button", {
                name: "إكمال دورة يومية بعد الترحيل",
                exact: true,
            }),
        ).toBeVisible();
        for (const store of restartStores)
            assert.deepEqual(
                await readStore(page, store),
                schedulingData[store],
            );
        const source = (await readStore(page, "tasks")).find(
            (t) => t.id === recurringId,
        );
        assert.equal(source.status, "todo");
        assert.equal(source.priority, "important-urgent");
        assert.equal(source.notes, "ملاحظات دورة محفوظة");
        const cycles = (await readStore(page, "taskCycles")).filter(
            (c) => c.taskId === recurringId,
        );
        assert.equal(cycles.filter((c) => c.status === "completed").length, 1);
        assert.equal(cycles.filter((c) => c.status === "current").length, 1);
        if (planningMode) {
            await page.goto(baseURL + "#today");
            await expect(
                page.getByRole("region", { name: "اخترتها لليوم" }),
            ).toContainText("مهمة تجريبية قبل التدقيق");
            await page.goto(baseURL + "#calendar");
            await expect(page.locator(".calendar-day")).toHaveCount(7);
            await page.goto(baseURL + "#progress");
            const insightsTab = page.getByRole("tab", {
                name: "رؤى مسار",
                exact: true,
            });
            await insightsTab
                .or(page.getByRole("region", { name: "رؤى مسار", exact: true }))
                .first()
                .waitFor();
            if (await insightsTab.isVisible()) await insightsTab.tap();
            await expect(
                page.getByRole("region", { name: "رؤى مسار", exact: true }),
            ).toBeVisible();
            for (const store of restartStores)
                assert.deepEqual(
                    await readStore(page, store),
                    schedulingData[store],
                );
        }
    }
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                basePath,
                update_preserved_all_five_stores: true,
                update_preserved_store_names: preservedStores,
                update_preserved_preexisting_project_history:
                    preservedStores.includes("projectProgress") &&
                    preservedStores.includes("projectTracking"),
                pace_sidecars_persisted_offline: paceMode,
                native_database_version_before: beforeDatabases.find(
                    (d) => d.name === "masar-v1",
                ).version,
                update_preserved_preexisting_task_cycles: preexistingTasks,
                planning_and_eight_stores_survived_offline_restart:
                    planningMode,
                task_scheduling_and_six_stores_survived_offline_restart:
                    tasksMode,
                native_database_version: cached.databases.find(
                    (database) => database.name === "masar-v1",
                ).version,
                backup_created: true,
                repeated_toggle_after_update: true,
                offline_reload: true,
                browser_closed_and_reopened_offline: true,
                remembered_step_and_theme_survived_browser_restart: true,
                ...(darkAudit
                    ? {
                          dark_canvas_and_system_metadata_survived_offline_restart: true,
                          precache_contains_only_current_entry_js_and_css: true,
                      }
                    : {}),
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
