import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { sizedFixture, readStore } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const root = fs.mkdtempSync("/tmp/masar-phase3-pwa-"),
    site = path.join(root, "site/honor-wall"),
    profile = path.join(root, "profile");
const oldBuild = "/tmp/masar-habits-phase2-production",
    newBuild = "/tmp/masar-habits-phase3-production";
const base = "http://127.0.0.1:4187/honor-wall/";
const output = new URL("./", import.meta.url).pathname;
const options = {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
    timezoneId: "Asia/Riyadh",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
};
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
    "habitPaths",
    "habits",
    "habitPlans",
    "habitEntries",
    "habitSuggestions",
    "reminders",
    "habitImportReceipts",
];
const checks = [],
    errors = [];
const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
};
const all = async (page) =>
    Object.fromEntries(
        await Promise.all(
            stores.map(async (name) => [name, await readStore(page, name)]),
        ),
    );
fs.mkdirSync(path.dirname(site), { recursive: true });
fs.cpSync(oldBuild, site, { recursive: true });
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4187",
        "--bind",
        "127.0.0.1",
        "--directory",
        path.join(root, "site"),
    ],
    { stdio: "ignore" },
);
let context;
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(base)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
    }
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    watch(page);
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await page.goto(base + "#backup");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const d = habitFixture(),
        old = sizedFixture(3);
    Object.assign(d, {
        projects: old.projects,
        steps: old.steps,
        tasks: old.tasks,
        ideas: old.ideas,
        events: [],
        projectTracking: [
            {
                projectId: "p",
                since: old.exportedAt,
                origin: "existing",
                lastOrder: 0,
                initialPercent: 0,
            },
        ],
        projectPlans: [
            {
                projectId: "p",
                since: old.exportedAt,
                revision: 0,
                workOrder: 0,
                pauses: [],
            },
        ],
        projectProgress: [],
        stepWork: [],
        recommendations: [],
        paceSettings: [],
    });
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "isolated-phase2.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(d)),
    });
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const before = await all(page);
    checks.push(
        "isolated_phase2_snapshot5_seeded_with_historical_habits_and_legacy_data",
    );
    const schemaBefore = (
        await page.evaluate(() => indexedDB.databases())
    ).find((d) => d.name === "masar-v1").version;
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
    assert.deepEqual(await all(page), before);
    checks.push("pwa_update_preserves_all_19_stores_byte_for_byte");
    const schemaAfter = (await page.evaluate(() => indexedDB.databases())).find(
        (d) => d.name === "masar-v1",
    ).version;
    assert.equal(schemaBefore, 70);
    assert.equal(schemaAfter, 70);
    checks.push("no_new_schema_migration_70_to_70");
    assert.deepEqual(
        JSON.parse(
            fs.readFileSync(
                path.join(newBuild, "manifest.webmanifest"),
                "utf8",
            ),
        ),
        oldManifest,
    );
    checks.push("manifest_identity_and_start_url_scope_unchanged");
    await page.goto(base + "#habit/bed");
    await expect(
        page.getByRole("region", { name: "تفاصيل العادة", exact: true }),
    ).toBeVisible();
    await page.locator(".habit-detail > .habit-row button").click();
    await expect(
        page.locator(".habit-detail > .habit-row button"),
    ).toHaveAttribute("aria-pressed", "true");
    const now = await all(page);
    assert.equal(now.habitEntries.length, before.habitEntries.length + 1);
    for (const s of stores.filter((s) => s !== "habitEntries"))
        assert.deepEqual(now[s], before[s]);
    checks.push("new_simple_recording_writes_only_habit_entries");
    await page.goto(base + "#home");
    await expect(
        page.getByRole("region", { name: "عاداتي اليوم", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        }),
    ).toBeVisible();
    checks.push("home_card_reads_same_habit_record");
    const assetState = await page.evaluate(async () => {
        const keys = await caches.keys();
        const urls = (
            await Promise.all(
                keys.map(async (k) =>
                    (await (await caches.open(k)).keys()).map(
                        (r) => new URL(r.url).pathname,
                    ),
                ),
            )
        ).flat();
        const loaded = [
            ...document.querySelectorAll("script[src],link[rel=stylesheet]"),
        ]
            .map((n) => new URL(n.src || n.href).pathname)
            .filter((p) => /\/assets\/.*\.(js|css)$/.test(p));
        return {
            urls,
            loaded,
            controlled: !!navigator.serviceWorker.controller,
        };
    });
    assert.equal(assetState.controlled, true);
    for (const asset of assetState.loaded)
        assert.ok(assetState.urls.includes(asset));
    const allowed = fs.readdirSync(path.join(newBuild, "assets"));
    assert.ok(
        assetState.urls
            .filter((u) => /\/assets\/.*\.(js|css)$/.test(u))
            .every((u) => allowed.includes(path.basename(u))),
    );
    checks.push("service_worker_controls_page_and_caches_only_current_assets");
    await page.screenshot({ path: path.join(output, "pwa-updated-390.png") });
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
        ...options,
        offline: true,
    });
    page = await context.newPage();
    watch(page);
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await page.goto(base + "#home");
    await expect(
        page.getByRole("region", { name: "عاداتي اليوم", exact: true }),
    ).toBeVisible();
    assert.deepEqual(await all(page), now);
    checks.push(
        "full_browser_restart_offline_preserves_all_19_stores_and_recording",
    );
    await page
        .getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        })
        .click();
    await expect(
        page.getByRole("button", {
            name: "تسجيل عادة «ترتيب السرير»",
            exact: true,
        }),
    ).toBeVisible();
    checks.push("offline_home_undo_uses_original_entry_without_duplication");
    await page.goto(base + "#habit/bed");
    await expect(
        page.locator(".habit-detail > .habit-row button"),
    ).toHaveAttribute("aria-pressed", "false");
    await page.locator(".habit-detail > .habit-row button").click();
    await expect(
        page.locator(".habit-detail > .habit-row button"),
    ).toHaveAttribute("aria-pressed", "true");
    checks.push("offline_detail_can_complete_again");
    for (const route of [
        "habits",
        "habit-path/culture",
        "tasks",
        "projects",
        "ideas",
        "progress",
    ]) {
        await page.goto(base + "#" + route);
        await expect(page.locator("main")).toHaveAttribute(
            "data-route",
            route.split("/")[0],
        );
        await expect(page.locator(".living-sky")).toBeVisible();
    }
    checks.push("offline_habits_paths_and_existing_routes_work");
    const final = await all(page);
    assert.equal(final.habitEntries.length, now.habitEntries.length);
    assert.deepEqual(final.habitSuggestions, before.habitSuggestions);
    assert.deepEqual(final.reminders, before.reminders);
    checks.push("no_duplicate_entries_or_unapproved_suggestions_reminders");
    await page.screenshot({ path: path.join(output, "pwa-offline-390.png") });
    assert.deepEqual(errors, []);
    const result = {
        at: new Date().toISOString(),
        checks,
        passed: checks.length,
        errors,
        schemaBefore,
        schemaAfter,
        isolatedProfile: true,
        fullOfflineRestart: true,
        physicalAndroidTested: false,
        nativeAndroidBackupDownloadVerified: false,
        androidBackupDownloadRequiredBeforePublication: true,
        published: false,
        personalUserDataAccessed: false,
    };
    fs.writeFileSync(
        path.join(output, "pwa-result.json"),
        JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
} finally {
    await context?.close();
    server.kill("SIGTERM");
}
