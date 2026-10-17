import { habitFixture } from "../../tests/habitFixtures.ts";
import { habitStores } from "../../app/backupTables.ts";
import { chromium, expect } from "@playwright/test";
import {
    navigateView,
    readStore,
    sizedFixture,
    openCreate,
    chooseTaskToday,
} from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const oldBuild = "/tmp/masar-release-143-production";
const newBuild = "/tmp/masar-habits-phase2-production";
const root = fs.mkdtempSync("/tmp/masar-habits-phase2-pwa-");
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
    await page.clock.setFixedTime(new Date(clock));
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
    await page.evaluate(async () => {
        const database = await new Promise((resolve,reject)=>{const r=indexedDB.open("masar-v1");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        await new Promise((resolve,reject)=>{
            const tx=database.transaction(["recommendations","projectPlans"],"readwrite");
            tx.objectStore("recommendations").add({id:"legacy-decision",key:"legacy-decision",type:"focus",projectIds:["p"],reason:"قرار اختبار معزول",effect:"تاريخ محفوظ",createdAt:"2026-10-21T09:00:00.000Z",status:"rejected",decidedAt:"2026-10-21T09:00:00.000Z",changes:[{type:"pause",projectId:"p"}],basis:"isolated-fixture"});
            const plans=tx.objectStore("projectPlans"), request=plans.get("p");
            request.onsuccess=()=>plans.put({...request.result,since:"2026-10-01T09:00:00.000Z",pauses:[{start:"2026-10-05T09:00:00.000Z",end:"2026-10-07T09:00:00.000Z"}]});
            tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
        });database.close();
    });
    const before = await readAll(page);
    assert.ok(stores.every(name=>before[name].length>0));
    checks.push("actual_143_database_has_nonempty_data_in_all_12_legacy_stores");
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
        70,
    );
    checks.push("additive_schema7_upgrade_60_to_70");
    for (const name of habitStores) assert.deepEqual(await readStore(page,name),[]);
    checks.push("all_seven_new_stores_empty_after_upgrade_no_synthetic_history");
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
    assert.equal(snapshot.version, 5);
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
    checks.push("backup_v5_restores_all_12_legacy_stores_json_values");
    const fixture=habitFixture();
    for(const name of habitStores)fixture[name].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const full={...snapshot,...Object.fromEntries(habitStores.map(name=>[name,fixture[name]]))};
    const load = async data => {
        await page.getByLabel("استيراد نسخة",{exact:true}).setInputFiles({name:"phase2-fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
        await page.getByRole("button",{name:"تأكيد استبدال البيانات",exact:true}).click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
    };
    await load(full);
    for(const name of habitStores) assert.deepEqual(await readStore(page,name),fixture[name]);
    const historical=Object.fromEntries(await Promise.all(habitStores.map(async name=>[name,await readStore(page,name)])));
    const old4={...snapshot,version:4};for(const name of habitStores)delete old4[name];
    await load(old4);
    for(const name of habitStores) assert.deepEqual(await readStore(page,name),historical[name]);
    checks.push("legacy_v4_restore_preserves_all_seven_new_stores_byte_for_byte");
    const safetyWait=page.waitForEvent("download");
    await page.getByRole("button",{name:"تنزيل نسخة الأمان الأخيرة",exact:true}).click();
    const safetyPath=path.join(root,"safety.json");await (await safetyWait).saveAs(safetyPath);
    const safety=JSON.parse(fs.readFileSync(safetyPath,"utf8"));assert.equal(safety.version,5);
    for(const name of habitStores)assert.deepEqual(safety[name],historical[name]);
    checks.push("independent_safety_database_exports_restorable_snapshot5");
    const other=await context.newPage();await other.clock.setFixedTime(new Date(clock));await other.goto(base+"#habits");
    await expect(other.locator(".habits-introduction")).toBeVisible();
    for(const name of habitStores)assert.deepEqual(await readStore(other,name),historical[name]);await other.close();
    checks.push("second_tab_sees_same_schema_and_habit_graph_without_duplicates");

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
    await page.clock.setFixedTime(new Date("2026-10-21T20:00:00Z"));
    await page.goto(base + "#today");
    await expect(page.locator(".today-ordered .task-row")).toHaveCount(4);
    assert.deepEqual(await readAll(page), restartData);
    for(const name of habitStores) assert.deepEqual(await readStore(page,name),historical[name]);
    checks.push("all_19_stores_preserved_after_full_browser_restart_offline");
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
    await expect(page.locator(".sidebar")).toHaveCSS("backdrop-filter", "blur(4px) saturate(1.08)");
    await expect(page.locator(".mobile-fab")).toHaveCSS("backdrop-filter", "blur(3px) saturate(1.08)");
    await page.locator(".mobile-fab").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".mobile-fab")).toBeFocused();
    checks.push("new_glass_controls_and_animated_dialog_close_work_offline");
    assert.deepEqual(errors, []);
    await page.goto(base + "#home");
    await page.evaluate(() => { window.sharedOfflineSky = document.querySelector('.living-sky'); });
    for (const route of ['home','projects','tasks','ideas','progress']) {
        await navigateView(page, route);
        await expect(page.locator('.living-sky')).toHaveCount(1);
        await expect(page.locator('.sky-scene')).toHaveCSS('filter','blur(27px)');
        assert.equal(await page.evaluate(() => window.sharedOfflineSky === document.querySelector('.living-sky')), true);
        assert.equal(await page.locator('.sidebar').evaluate(n => getComputedStyle(n,'::before').content), 'none');
    }
    checks.push('offline_five_routes_same_sky_blur27_and_no_fab_band');
    await page.goto(base + "#progress");
    await expect(page.locator(".glass-choice-indicator").first()).toBeVisible();
    await page.getByRole("button", {name:"سنوي",exact:true}).click();
    await expect(page.getByRole("button", {name:"سنوي",exact:true})).toHaveAttribute("aria-pressed","true");
    checks.push("shared_internal_choices_and_selection_work_offline");
    await page.locator(".navigation a[href='#habits']").click();
    await expect(page.locator(".habits-introduction")).toBeVisible();
    await expect(page.locator(".navigation a")).toHaveCount(3);
    await page.locator(".task-shortcut").click();
    await expect(page.locator(".task-controls")).toBeVisible();
    checks.push("three_sections_habits_landing_and_direct_task_shortcut_work_offline");
    await page.goto(base+"#backup");
    // Independent check of offline file generation, not native download saving.
    // The untouched pwa-check.mjs and chromium-download-control.mjs reproduce
    // the distro Chromium crash; it remains a blocked verification below.
    await page.evaluate(()=>{
        const click=HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click=function(...args){
            if(this.download.startsWith("masar-safety-")){
                fetch(this.href).then(r=>r.text()).then(text=>{window.phase2GeneratedSafety=JSON.parse(text);});
                return;
            }
            return click.apply(this,args);
        };
    });
    await page.getByRole("button",{name:"تنزيل نسخة الأمان الأخيرة",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>!!window.phase2GeneratedSafety)).toBe(true);
    assert.deepEqual(await page.evaluate(()=>window.phase2GeneratedSafety),safety);
    checks.push("safety_copy_persists_and_generates_correct_blob_json_offline_native_save_not_claimed");
    fs.writeFileSync(
        path.join(output, "pwa-result.json"),
        JSON.stringify(
            {
                release: "Habits phase2 — local candidate",
                at: new Date().toISOString(),
                base,
                checks,
                checks_passed: checks.length,
                errors,
                old_deployment: "b52682daf6fb5e9a3a10284437153ac4e765ba21",
                database_before: 60,
                database_after: 70,
                stores_before_counts: Object.fromEntries(
                    stores.map((s) => [s, before[s].length]),
                ),
                backup_restored: true,
                full_offline_browser_restart: true,
                physical_android_tested: false,
                published: false,
                native_offline_file_save_verified: false,
                blocked_checks: ["Native save after persistent-browser restart: system Chromium154 crashes on a trivial independent Blob download; matching Playwright browser download blocked by domain403."],
                blur_after_offline_restart: 27,
                isolated_profile: true,
                personal_user_data_accessed: false,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(
        "PASS PWA storage/update checks (native offline save remains blocked)",
        checks.length,
        "checks; all 12 old stores unchanged across migration; all 19 stores and safety copy survive offline restart",
    );
} finally {
    await context?.close();
    server.kill();
}
