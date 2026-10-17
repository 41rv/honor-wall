import { test, expect } from "@playwright/test";
import { appUrl } from "./url";
import { importData, readStore, sizedFixture } from "./helpers";
import { habitFixture } from "../habitFixtures";
import { habitStores } from "../../app/backupTables";
import { readFileSync } from "node:fs";

test("الاستعادة الجارية لا توهم بالإلغاء عند Escape أو النقر خارج النافذة", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await importData(page, habitFixture());
    const preserved = Object.fromEntries(await Promise.all(habitStores.map(async n => [n, await readStore(page, n)])));
    const legacy = sizedFixture(3);
    await page.goto(appUrl("/#backup"));
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "isolated-old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(legacy)),
    });
    const dialog = page.getByRole("dialog", { name: "معاينة النسخة الاحتياطية", exact: true });
    const confirm = dialog.getByRole("button", { name: "تأكيد استبدال البيانات", exact: true });
    await expect(confirm).toBeEnabled();
    // A real, isolated IndexedDB transaction holds the write, rather than an
    // artificial UI timeout. Release it after exercising both dismissal paths.
    await page.evaluate(async () => {
        const request = indexedDB.open("masar-v1");
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const state = window as unknown as { phase8Holding: boolean };
        state.phase8Holding = true;
        const tx = database.transaction("tasks", "readonly");
        const next = () => {
            const read = tx.objectStore("tasks").get("phase8-absent");
            read.onsuccess = () => { if (state.phase8Holding) next(); };
        };
        tx.oncomplete = () => database.close();
        next();
    });
    try {
        await confirm.click();
        await expect(confirm).toBeDisabled();
        await page.keyboard.press("Escape");
        await dialog.evaluate(async node => {
            await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
        });
        await expect(dialog).toBeVisible();
        await page.mouse.click(2, 2);
        await dialog.evaluate(async node => {
            await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
        });
        await expect(dialog).toBeVisible();
        await expect(confirm).toBeDisabled();
    } finally {
        await page.evaluate(() => { (window as unknown as { phase8Holding: boolean }).phase8Holding = false; });
    }
    await expect(dialog).toHaveCount(0);
    expect(await readStore(page, "tasks")).toEqual(legacy.tasks);
    for (const store of habitStores) expect(await readStore(page, store)).toEqual(preserved[store]);
    await expect(page.getByRole("button", { name: "تنزيل نسخة الأمان الأخيرة", exact: true })).toBeEnabled();
});

for (const width of [320, 390, 768, 1366])
    for (const theme of ["light", "dark"])
        test(`النسخة المرشحة — الصفحات القديمة والجديدة وRTL ${width} ${theme}`, async ({ page }) => {
            const errors: string[] = [];
            page.on("pageerror", e => errors.push(e.message));
            page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
            await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
            await page.setViewportSize({ width, height: 844 });
            await page.addInitScript(mode => localStorage.setItem("masar-theme", mode), theme);
            const data = Object.assign(habitFixture(), JSON.parse(readFileSync("docs/habits-phase8/schema6-fixture.json", "utf8")), { version: 5 as const });
            await importData(page, data);
            for (const route of ["home", "habits", "habit-path/culture", "habit/reading", "projects", `project/${data.projects[0].id}`, "tasks", "ideas", "ideas/reminders", "progress", "backup"]) {
                await page.goto(appUrl("/#" + route));
                await expect(page.locator("main")).toHaveAttribute("data-route", route.split("/")[0]);
                await expect(page.locator(".living-sky")).toBeVisible();
                await expect(page.locator("main h1").first()).toBeVisible();
                expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                if (width <= 390) await page.screenshot({ path: `docs/habits-phase8/${route.startsWith("project/") ? "project-detail" : route.replaceAll("/", "-")}-${theme}-${width}.png`, fullPage: true, animations: "disabled" });
                await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
                await expect(page.getByRole("button", { name: "إضافة سريعة", exact: true })).toBeVisible();
            }
            expect(errors).toEqual([]);
        });
