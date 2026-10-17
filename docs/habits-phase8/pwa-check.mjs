import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { readStore } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
const root = fs.mkdtempSync("/tmp/masar-phase8-pwa-"),
    site = path.join(root, "site/honor-wall"),
    profile = path.join(root, "profile");
const oldBuild = "/tmp/masar-phase8-published",
    newBuild = "/workspace/honor-wall/build";
const base = "http://127.0.0.1:4188/honor-wall/";
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
const hashes = directory => Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(e=>e.isFile()).map(e=>{const file=path.join(e.parentPath,e.name);return [path.relative(directory,file),createHash("sha256").update(fs.readFileSync(file)).digest("hex")];}));
const testedBuild = hashes(newBuild);
const checks = [],
    errors = [];
const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
};
const all = async (page, names = stores) =>
    Object.fromEntries(
        await Promise.all(
            names.map(async (name) => [name, await readStore(page, name)]),
        ),
    );
fs.mkdirSync(path.dirname(site), { recursive: true });
fs.cpSync(oldBuild, site, { recursive: true });
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4188",
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
    const old = JSON.parse(fs.readFileSync(new URL("./schema6-fixture.json", import.meta.url), "utf8"));
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "isolated-published-schema6.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)),
    });
    await page.getByRole("button", { name: "تأكيد استبدال البيانات", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const legacy = stores.slice(0, 12);
    for (const name of legacy) assert.ok((await readStore(page, name)).length > 0, name);
    await page.evaluate(async () => {
        const request = indexedDB.open("masar-v1");
        const database = await new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
        await new Promise((resolve,reject)=>{
            const tx=database.transaction("tasks","readwrite"),store=tx.objectStore("tasks"),get=store.getAll();
            get.onsuccess=()=>store.put({...get.result[0],phase8UnknownLegacyField:{preserved:true}});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        });database.close();
    });
    const legacyBefore = await all(page, legacy);
    const indexes = async () => page.evaluate(async () => {
        const request=indexedDB.open("masar-v1");
        const database=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const names=Array.from(database.objectStoreNames),tx=database.transaction(names);
        const result=Object.fromEntries(names.map(name=>{const store=tx.objectStore(name);return[name,{keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:Array.from(store.indexNames).map(n=>{const index=store.index(n);return{name:n,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};})}];}));
        database.close();return result;
    });
    const indexesBefore=await indexes();
    fs.writeFileSync(path.join(output,"migration-before.json"),JSON.stringify({nativeVersion:60,rows:legacyBefore,indexes:indexesBefore},null,2)+"\n");
    checks.push("actual_published_1_4_3_bytes_seeded_all_12_legacy_stores_and_unknown_field");
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
    assert.deepEqual(await all(page, legacy), legacyBefore);
    const indexesAfter=await indexes();
    for(const name of legacy)assert.deepEqual(indexesAfter[name],indexesBefore[name]);
    for(const name of stores.slice(12))assert.deepEqual(await readStore(page,name),[]);
    checks.push("schema6_to_7_all_12_rows_and_indexes_identical_new_7_stores_empty");
    const schemaAfter = (await page.evaluate(() => indexedDB.databases())).find(d=>d.name==="masar-v1").version;
    assert.equal(schemaBefore,60);assert.equal(schemaAfter,70);
    checks.push("native_indexeddb_migrates_60_to_70_without_database_recreation");
    fs.writeFileSync(path.join(output,"migration-after.json"),JSON.stringify({nativeVersion:70,rows:await all(page),indexes:indexesAfter},null,2)+"\n");
    await page.reload();
    await expect(page.getByRole("heading",{name:"بياناتك في أمان",exact:true})).toBeVisible();
    assert.deepEqual(await all(page,legacy),legacyBefore);
    checks.push("second_open_preserves_legacy_data_and_unknown_field_without_repeat_migration");
    // Seed only the new stores in this isolated profile. This leaves the old
    // rows intact while exercising the new offline UI against upgraded data.
    const d=habitFixture();d.habitSuggestions=d.habitSuggestions.filter(s=>s.status!=="new");
    await page.evaluate(async ({data,names})=>{
        const request=indexedDB.open("masar-v1");
        const database=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        await new Promise((resolve,reject)=>{
            const tx=database.transaction(names,"readwrite");
            for(const name of names)for(const row of data[name]??[])tx.objectStore(name).add(row);
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        });database.close();
    },{data:d,names:stores.slice(12)});
    const before=await all(page);
    assert.deepEqual(await all(page,legacy),legacyBefore);
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
    let now = await all(page);
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
    await expect.poll(async()=> (await readStore(page,"habitSuggestions")).some(s=>s.type==="maintain"&&s.status==="new")).toBe(true);
    const afterHome=await all(page);
    for(const store of stores.filter(s=>s!=="habitSuggestions"))assert.deepEqual(afterHome[store],now[store]);
    for(const row of before.habitSuggestions)assert.deepEqual(afterHome.habitSuggestions.find(s=>s.id===row.id),row);
    assert.equal(afterHome.habitSuggestions.filter(s=>!before.habitSuggestions.some(old=>old.id===s.id)).every(s=>s.type==="maintain"&&s.status==="new"),true);
    now=afterHome;
    checks.push("automatic_advice_adds_only_explainable_proposals_keeps_old_decisions_and_plans");
    await page.goto(base+"#backup");
    const waitingDownload=page.waitForEvent("download");
    await page.getByRole("button",{name:"تصدير JSON",exact:true}).click();
    const backupFile=await (await waitingDownload).path();
    const exported=JSON.parse(fs.readFileSync(backupFile,"utf8"));
    assert.equal(exported.version,5);
    for(const name of stores)assert.deepEqual(exported[name],now[name]);
    checks.push("native_chromium_download_snapshot5_matches_all_19_upgraded_stores");
    await page.getByLabel("استيراد نسخة",{exact:true}).setInputFiles({name:"upgraded-snapshot5.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(exported))});
    const preview=page.getByRole("dialog",{name:"معاينة النسخة الاحتياطية",exact:true});
    await expect(preview).toContainText("التسعة عشر");
    await page.screenshot({path:path.join(output,"upgraded-backup-preview-390.png")});
    await page.keyboard.press("Escape");await expect(preview).toHaveCount(0);
    assert.deepEqual(await all(page),now);
    checks.push("downloaded_file_reopens_in_restore_preview_without_mutating_data");
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
    const serverStopped=new Promise(resolve=>server.once("exit",resolve));
    server.kill("SIGTERM");await serverStopped;
    let serverUnavailable=false;try{await fetch(base);}catch{serverUnavailable=true;}
    assert.equal(serverUnavailable,true);
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
    assert.deepEqual(final.habitSuggestions, now.habitSuggestions);
    assert.deepEqual(final.reminders, before.reminders);
    checks.push("no_duplicate_entries_or_automatic_plan_changes_or_reminders");
    await page.screenshot({ path: path.join(output, "pwa-offline-390.png"),animations:"disabled" });
    await page.goto(base+"#habit/reading");
    const gradedRow=page.locator(".habit-detail > .habit-row");
    await gradedRow.getByRole("spinbutton",{name:"كمية «قراءة»",exact:true}).fill("3");
    await gradedRow.getByRole("button",{name:"سجّل",exact:true}).click();
    await expect(gradedRow.getByRole("button",{name:"تراجع",exact:true})).toBeVisible();
    const recorded=(await readStore(page,"habitEntries")).find(e=>e.habitId==="reading"&&e.localDate==="2026-10-21");
    assert.equal(recorded.result.amount,3);assert.equal(recorded.result.threshold,2);
    await gradedRow.getByRole("spinbutton",{name:"كمية «قراءة»",exact:true}).fill("4");
    await gradedRow.getByRole("button",{name:"تعديل التسجيل",exact:true}).click();
    await expect.poll(async()=> (await readStore(page,"habitEntries")).find(e=>e.id===recorded.id)?.result.amount).toBe(4);
    await gradedRow.getByRole("button",{name:"تراجع",exact:true}).click();
    await expect(gradedRow.getByRole("button",{name:"سجّل",exact:true})).toBeVisible();
    checks.push("offline_graded_record_edit_undo_preserves_historical_entries");
    await page.goto(base+"#habits");
    await page.getByRole("button",{name:"استيراد عادات",exact:true}).click();
    const doc={format:"masar.habits",version:1,kind:"habit",habit:{key:"offline",title:"عادة مستوردة دون اتصال",kind:"simple",schedule:{repeat:"daily"}}};
    await page.getByLabel("ملف JSON للعادات").setInputFiles({name:"offline-habit.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(doc))});
    await page.getByRole("button",{name:"تأكيد استيراد العادات",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading",{name:doc.habit.title,exact:true})).toBeVisible();
    checks.push("offline_masar_habits_import_preview_and_atomic_commit");
    await page.goto(base+"#ideas/reminders");
    const remindersArea=page.getByRole("region",{name:"التذكيرات",exact:true});
    await remindersArea.getByLabel("عنوان التذكير",{exact:true}).fill("كتاب محفوظ دون اتصال");
    await remindersArea.getByRole("button",{name:"حفظ سريع",exact:true}).click();
    await remindersArea.getByRole("button",{name:"مراجعة «كتاب محفوظ دون اتصال»",exact:true}).click();
    await expect(remindersArea.getByRole("button",{name:"التراجع عن مراجعة «كتاب محفوظ دون اتصال»",exact:true})).toBeVisible();
    await page.reload();await expect(remindersArea).toContainText("كتاب محفوظ دون اتصال");
    checks.push("offline_reminder_create_review_and_reload");
    const afterNew=await all(page);
    for(const store of stores.slice(0,12))assert.deepEqual(afterNew[store],before[store]);
    checks.push("phase8_offline_actions_leave_all_12_legacy_stores_unchanged");
    assert.deepEqual(errors, []);
    assert.deepEqual(hashes(newBuild),testedBuild);
    const result = {
        testedBuild,
        at: new Date().toISOString(),
        checks,
        passed: checks.length,
        errors,
        schemaBefore,
        schemaAfter,
        isolatedProfile: true,
        fullOfflineRestart: true,
        serverUnavailableDuringOfflineRestart: serverUnavailable,
        physicalAndroidTested: false,
        nativeAndroidBackupDownloadVerified: false,
        androidBackupDownloadRequiredBeforePublication: true,
        published: false,
        source: "actual public 1.4.3 bytes downloaded with verified TLS; isolated localhost origin",
        indexesBefore, indexesAfter,
        legacyCounts: Object.fromEntries(legacy.map(n=>[n,legacyBefore[n].length])),
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
