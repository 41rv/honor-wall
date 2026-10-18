import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { importData, readStore, sizedFixture, navigateView } from "./helpers";
import { habitFixture } from "../habitFixtures";
import { backupStores, habitStores } from "../../app/backupTables";
import type { Snapshot } from "../../app/model";
const output = "docs/habits-phase2";
fs.mkdirSync(output, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") list.push(m.text());
    });
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const all = async (page: Page) =>
    Object.fromEntries(
        await Promise.all(
            backupStores.map(async (n) => [n, await readStore(page, n)]),
        ),
    );
async function preview(page: Page, data: unknown) {
    await page.goto(appUrl("/#backup"));
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "isolated.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    return page.getByRole("dialog", {
        name: "معاينة النسخة الاحتياطية",
        exact: true,
    });
}
async function download(page: Page, label = "تصدير JSON") {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await (await waiting).path();
    return JSON.parse(await readFile(file!, "utf8")) as Snapshot;
}
function old(version: 1 | 2 | 3 | 4): Snapshot {
    const d = sizedFixture(3);
    d.version = version;
    d.taskCycles = [];
    d.projectProgress = [];
    d.projectTracking =
        version >= 3
            ? [
                  {
                      projectId: "p",
                      since: d.exportedAt,
                      origin: "existing",
                      lastOrder: 0,
                      initialPercent: 0,
                  },
              ]
            : [];
    if (version === 4) {
        d.projectPlans = [
            {
                projectId: "p",
                since: d.exportedAt,
                revision: 0,
                workOrder: 0,
                pauses: [],
            },
        ];
        d.stepWork = [];
        d.recommendations = [];
        d.paceSettings = [
            { id: "pace", activeLimit: 3, importDigests: ["legacy-receipt"] },
        ];
    }
    return d;
}
test("قاعدة جديدة ومداخل المرحلة الأولى:20 مخزنًا دون بيانات عادات افتراضية", async ({
    page,
}) => {
    await page.goto(appUrl("/"));
    await expect(page.locator("main")).toHaveAttribute("data-route", "home");
    for (const n of habitStores) expect(await readStore(page, n)).toEqual([]);
    const native = (await page.evaluate(() => indexedDB.databases())).find(
        (d) => d.name === "masar-v1",
    );
    expect(native!.version).toBe(80);
    await navigateView(page, "habits");
    await expect(
        page.getByRole("heading", { name: "مساراتي", exact: true }),
    ).toBeVisible();
    await navigateView(page, "projects");
    for (const route of ["tasks", "ideas", "progress"]) {
        await navigateView(page, route);
        await expect(page.locator(".workspace-back")).toBeVisible();
    }
});
test("Snapshot5→6:معاينة وحفظ وتصدير مطابق وإعادة فتح دون سجلات إضافية", async ({
    page,
}) => {
    const source = habitFixture();
    const dialog = await preview(page, source);
    await expect(dialog).toContainText("2 عادات");
    await expect(dialog).toContainText("المصفوفة الفارغة");
    await dialog
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
    const before = await all(page),
        exported = await download(page);
    expect(exported.version).toBe(6);
    for (const n of habitStores) expect(exported[n]).toEqual(before[n]);
    await page.reload();
    for (const n of habitStores)
        expect(await readStore(page, n)).toEqual(before[n]);
});
for (const version of [1, 2, 3, 4] as const)
    test(`نسخة${version}:الاستعادة الافتراضية تبقي العادات والتذكيرات وتتيح نسخة الأمان`, async ({
        page,
    }) => {
        await importData(page, habitFixture());
        const before = await all(page),
            dialog = await preview(page, old(version));
        await expect(dialog.getByRole("status")).toContainText(
            "ستبقى بيانات العادات",
        );
        await dialog
            .getByRole("button", {
                name: "تأكيد استبدال البيانات",
                exact: true,
            })
            .click();
        await expect(dialog).not.toBeVisible();
        for (const n of habitStores)
            expect(await readStore(page, n)).toEqual(before[n]);
        const safety = await download(page, "تنزيل نسخة الأمان الأخيرة");
        expect(safety.version).toBe(6);
        for (const n of habitStores) expect(safety[n]).toEqual(before[n]);
    });
test("الاستبدال الكامل منفصل ويحتاج اختيارًا صريحًا،ونسخة الأمان تستعيد كل المحذوف", async ({
    page,
}) => {
    await importData(page, habitFixture());
    const before = await all(page),
        dialog = await preview(page, old(4));
    await dialog.locator("summary").click();
    const full = dialog.getByRole("button", {
        name: "تأكيد الاستبدال الكامل",
        exact: true,
    });
    await expect(full).toBeDisabled();
    await expect(dialog).toContainText("سجلًا إضافيًا");
    await dialog
        .getByRole("checkbox", {
            name: "أوافق على حذف الأقسام غير الموجودة في الملف",
            exact: true,
        })
        .check();
    await full.click();
    await expect(dialog).not.toBeVisible();
    for (const n of habitStores) expect(await readStore(page, n)).toEqual([]);
    const safety = await download(page, "تنزيل نسخة الأمان الأخيرة");
    await importData(page, safety);
    for (const n of habitStores)
        expect(await readStore(page, n)).toEqual(before[n]);
});
test("الدمج السريع وإعادة اختيار الملف لا يكرران،والمستويات والقرارات ترتبط بالمعرفات الجديدة", async ({
    page,
}) => {
    await importData(page, habitFixture());
    const dialog = await preview(page, habitFixture());
    const button = dialog.getByRole("button", {
        name: "دمج دون استبدال",
        exact: true,
    });
    await button.evaluate((b) => {
        (b as HTMLButtonElement).click();
        (b as HTMLButtonElement).click();
    });
    await expect(dialog).not.toBeVisible();
    expect(await readStore(page, "habits")).toHaveLength(4);
    expect(await readStore(page, "habitEntries")).toHaveLength(6);
    const before = await all(page);
    const second = await preview(page, {
        ...habitFixture(),
        exportedAt: "2026-10-22T10:00:00.000Z",
    });
    await second
        .getByRole("button", { name: "دمج دون استبدال", exact: true })
        .click();
    await expect(second).not.toBeVisible();
    expect(await all(page)).toEqual(before);
    const data = await download(page);
    expect(
        data.habitSuggestions!.filter((s) => s.status === "accepted"),
    ).toHaveLength(2);
    expect(
        data.habitSuggestions!.filter((s) => s.status === "invalid"),
    ).toHaveLength(1);
    const reading = data.habits!.find(
        (h) => h.kind === "graded" && h.id !== "reading",
    )!;
    const plans = data.habitPlans!.filter((p) => p.habitId === reading.id);
    expect(plans[0].phases[0].key).not.toBe("pages");
    expect(
        data
            .habitEntries!.filter((e) => e.habitId === reading.id)
            .every((e) => plans.some((p) => p.id === e.planId)),
    ).toBe(true);
});
test("التحقق يمنع الملفات المكسورة قبل الكتابة ولا توجد واجهة استيراد عادات مبكرة", async ({
    page,
}) => {
    await importData(page, habitFixture());
    const before = await all(page);
    const invalid = habitFixture();
    invalid.habitEntries![0].planId = "missing";
    for (const data of [
        invalid,
        { ...habitFixture(), habitPlans: null },
        {
            format: "masar.habits",
            version: 1,
            kind: "habit",
            habit: { title: "خارج المرحلة" },
        },
    ]) {
        await preview(page, data);
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await expect(page.locator(".toast")).toContainText("غير صالحة");
        expect(await all(page)).toEqual(before);
    }
});
test("Quota في نسخة الأمان يمنع المسح عبر الواجهة ويتيح المحاولة مجددًا", async ({
    page,
}) => {
    await importData(page, habitFixture());
    const before = await all(page);
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        Object.assign(window, { restoreAdd: add });
        IDBObjectStore.prototype.add = function (...args) {
            if (this.transaction.db.name === "masar-v1-recovery")
                throw new DOMException(
                    "امتلأت مساحة الاختبار",
                    "QuotaExceededError",
                );
            return add.apply(this, args);
        };
    });
    const dialog = await preview(page, old(4));
    await dialog
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.locator(".toast")).toContainText("نسخة أمان");
    await expect(dialog).toBeVisible();
    expect(await all(page)).toEqual(before);
    await page.evaluate(() => {
        IDBObjectStore.prototype.add = (
            window as unknown as {
                restoreAdd: typeof IDBObjectStore.prototype.add;
            }
        ).restoreAdd;
    });
    await dialog
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
});
test("فشل IndexedDB أثناء إدراج التذكيرات يتراجع عن كامل الاستعادة", async ({
    page,
}) => {
    await importData(page, habitFixture());
    const before = await all(page);
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
            if (
                this.transaction.db.name === "masar-v1" &&
                this.name === "reminders"
            )
                throw new Error("فشل كتابة اختباري");
            return add.apply(this, args);
        };
    });
    const dialog = await preview(page, habitFixture());
    await dialog
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.locator(".toast")).toContainText("فشل كتابة اختباري");
    expect(await all(page)).toEqual(before);
    await page.keyboard.press("Escape");
    const safety = await download(page, "تنزيل نسخة الأمان الأخيرة");
    for (const n of habitStores) expect(safety[n]).toEqual(before[n]);
});
for (const width of [320, 390])
    for (const theme of ["light", "dark"])
        test(`معاينة الاستعادة وRTL والثيم ${width} ${theme}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 844 });
            await page.addInitScript(
                (mode) => localStorage.setItem("masar-theme", mode),
                theme,
            );
            await importData(page, habitFixture());
            const dialog = await preview(page, old(4));
            await dialog.locator("summary").click();
            await dialog.getByRole("checkbox").check();
            expect(
                await dialog.evaluate(
                    (node) => node.scrollWidth <= node.clientWidth + 1,
                ),
            ).toBe(true);
            const checkbox = await dialog.getByRole("checkbox").boundingBox();
            expect(checkbox!.width).toBe(20);
            expect(checkbox!.height).toBe(20);
            const box = (await dialog.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            await expect(
                dialog.getByRole("button", {
                    name: "تأكيد الاستبدال الكامل",
                    exact: true,
                }),
            ).toBeEnabled();
            expect(
                (
                    await new AxeBuilder({ page })
                        .include("dialog")
                        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                        .analyze()
                ).violations,
            ).toEqual([]);
            const fullButton = dialog.getByRole("button", {
                name: "تأكيد الاستبدال الكامل",
                exact: true,
            });
            await fullButton.scrollIntoViewIfNeeded();
            const target = (await fullButton.boundingBox())!;
            expect(target.y).toBeGreaterThanOrEqual(box.y);
            expect(target.y + target.height).toBeLessThanOrEqual(
                box.y + box.height,
            );
            await page.screenshot({
                path: `${output}/restore-preview-${theme}-${width}.png`,
            });
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
        });

test("الاستعادة لا تعيد تطبيق اختيار قديم معلّق لمهامي اليوم عند إعادة الفتح", async ({
    page,
}) => {
    const source = old(4);
    await importData(page, source);
    await page.evaluate(() =>
        localStorage.setItem(
            "masar-pending-today/t0",
            JSON.stringify({
                id: "t0",
                today: { date: "2026-10-21", timeZone: "Asia/Riyadh" },
            }),
        ),
    );
    const dialog = await preview(page, source);
    await dialog
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
    expect(
        await page.evaluate(() =>
            localStorage.getItem("masar-pending-today/t0"),
        ),
    ).toBeNull();
    expect(
        (await readStore(page, "tasks")).find((t) => t.id === "t0")!.today,
    ).toBeUndefined();
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "بياناتك في أمان", exact: true }),
    ).toBeVisible();
    expect(
        (await readStore(page, "tasks")).find((t) => t.id === "t0")!.today,
    ).toBeUndefined();
});
