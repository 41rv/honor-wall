import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { importData, readStore, sizedFixture, navigateView } from "./helpers";
import { habitFixture } from "../habitFixtures";
import type { Snapshot } from "../../app/model";
import { legacyStores } from "../../app/backupTables";
const out = "docs/habits-phase3";
fs.mkdirSync(out, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") list.push(m.text());
    });
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
function fixture(): Snapshot {
    const base = sizedFixture(12),
        habits = habitFixture();
    return {
        ...habits,
        ...base,
        version: 5,
        taskCycles: [],
        projectProgress: [],
        projectTracking: [
            {
                projectId: "p",
                since: base.exportedAt,
                origin: "existing",
                lastOrder: 0,
                initialPercent: 0,
            },
        ],
        projectPlans: [
            {
                projectId: "p",
                since: base.exportedAt,
                revision: 0,
                workOrder: 0,
                pauses: [],
            },
        ],
        stepWork: [],
        recommendations: [],
        paceSettings: [],
        habitPaths: [
            ...habits.habitPaths!,
            {
                ...habits.habitPaths![0],
                id: "fitness",
                title: "المسار الرياضي",
                order: 1,
            },
        ],
        habits: [
            habits.habits![1],
            {
                ...habits.habits![1],
                id: "walk",
                title: "المشي الخفيف",
                pathId: "culture",
            },
        ],
        habitPlans: [
            habits.habitPlans![2],
            {
                ...habits.habitPlans![2],
                id: "walkplan",
                habitId: "walk",
                pathId: "culture",
                schedule: { repeat: "daily" },
            },
        ],
        habitEntries: [{ ...habits.habitEntries![2], difficulty: "hard" }],
        habitSuggestions: [],
        reminders: [],
        habitImportReceipts: [],
    };
}
async function seed(page: Page) {
    await importData(page, fixture());
    const close = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await close.isVisible()) await close.click();
    await page.goto(appUrl("/#habits"));
    await expect(
        page.getByRole("heading", { name: "مساراتي", exact: true }),
    ).toBeVisible();
}
async function settle(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
    });
}
async function menu(page: Page, action: string) {
    await page
        .getByRole("button", { name: "خيارات العادة أو المسار", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: action, exact: true })
        .click();
    if (
        ![
            "تعديل العادة",
            "تعديل المسار",
            "أرشفة العادة",
            "أرشفة المسار",
        ].includes(action)
    )
        await expect(page.getByRole("dialog")).toHaveCount(0);
}
const current = (page: Page) => page.locator(".habit-detail > .habit-row");
test("حساب جديد:لا بياناتافتراضية،إنشاءمساروعادةمستقلةوأسبوعيةوتعديلها", async ({
    page,
}) => {
    await page.goto(appUrl("/#habits"));
    await expect(
        page.getByRole("heading", { name: "مساراتي", exact: true }),
    ).toBeVisible();
    expect(await readStore(page, "habits")).toEqual([]);
    await page.getByRole("button", { name: "مسار جديد", exact: true }).click();
    let d = page.getByRole("dialog");
    await d.getByLabel("اسم المسار", { exact: true }).fill("مساري الثقافي");
    await d.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#habit-path\//);
    await menu(page, "تعديل المسار");
    d = page.getByRole("dialog");
    await d.getByLabel("اسم المسار", { exact: true }).fill("الثقافة اليومية");
    await d.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "الثقافة اليومية", exact: true }),
    ).toBeVisible();
    await navigateView(page, "habits");
    await page.getByRole("button", { name: "عادة جديدة", exact: true }).click();
    d = page.getByRole("dialog");
    await d.getByLabel("اسم العادة", { exact: true }).fill("ترتيب الطاولة");
    await expect(
        d.getByRole("combobox", { name: "المسار", exact: true }),
    ).toHaveValue("");
    await d.getByRole("button", { name: "أيام محددة", exact: true }).click();
    for (const name of [
        "السبت",
        "الأحد",
        "الاثنين",
        "الثلاثاء",
        "الخميس",
        "الجمعة",
    ])
        await d.getByRole("button", { name, exact: true }).click();
    await d.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#habit\//);
    const habits = await readStore(page, "habits");
    expect(habits).toHaveLength(1);
    expect(habits[0].pathId).toBeNull();
    expect((await readStore(page, "habitPlans"))[0].schedule).toEqual({
        repeat: "weekly",
        weekdays: [3],
    });
    await menu(page, "تعديل العادة");
    d = page.getByRole("dialog");
    await d.getByLabel("اسم العادة", { exact: true }).fill("مكتبي المرتب");
    await d
        .getByRole("combobox", { name: "المسار", exact: true })
        .selectOption({ label: "الثقافة اليومية" });
    await d.getByRole("button", { name: "يوميًا", exact: true }).click();
    await d.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page.getByText(/تغيير مخطط من/)).toBeVisible();
    expect(await readStore(page, "habitPlans")).toHaveLength(2);
});
test("الرئيسيةتسجلوترجعفورًاوالتسجيلوالإحصاءاتمنفصلةعنالمهاموالمشاريع", async ({
    page,
}) => {
    await seed(page);
    const legacy = Object.fromEntries(
        await Promise.all(
            legacyStores.map(async (n) => [n, await readStore(page, n)]),
        ),
    );
    await navigateView(page, "home");
    const card = page.getByRole("region", {
        name: "عاداتي اليوم",
        exact: true,
    });
    await expect(card).toBeVisible();
    const button = card.getByRole("button", {
        name: "تسجيل عادة «ترتيب السرير»",
        exact: true,
    });
    await button.click();
    await expect(
        card.getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(card.locator(".count")).toHaveText("1/2");
    await page.reload();
    await card
        .getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        })
        .click();
    await expect(card.locator(".count")).toHaveText("0/2");
    const entries = (await readStore(page, "habitEntries")).filter(
        (e) => e.localDate === "2026-10-21" && e.habitId === "bed",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].result).toEqual({ kind: "simple", done: false });
    for (const n of legacyStores)
        expect(await readStore(page, n)).toEqual(legacy[n]);
});
test("التسجيلالمتزامنمننافذتينلاينشئسجلينيوميين", async ({ page, context }) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    const second = await context.newPage();
    await second.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
    await second.goto(appUrl("/#habit/bed"));
    await expect(current(page)).toBeVisible();
    await expect(current(second)).toBeVisible();
    // Hold an isolated IndexedDB write transaction so both visible controls
    // capture the same unchecked state before either write can commit.
    await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open("masar-v1");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        await new Promise<void>((resolve) => {
            const tx = database.transaction(
                ["habits", "habitPaths", "habitPlans", "habitEntries"],
                "readwrite",
            );
            let held = true;
            (
                window as Window & { releaseHabitBarrier?: () => void }
            ).releaseHabitBarrier = () => {
                held = false;
            };
            tx.oncomplete = () => database.close();
            const keepAlive = () => {
                const req = tx
                    .objectStore("habits")
                    .get("barrier-only-in-test");
                req.onsuccess = () => {
                    if (held) keepAlive();
                };
            };
            keepAlive();
            resolve();
        });
    });
    await Promise.all([
        current(page).getByRole("button").click(),
        current(second).getByRole("button").click(),
    ]);
    await expect(current(page).getByRole("button")).toHaveAttribute(
        "aria-busy",
        "true",
    );
    await expect(current(second).getByRole("button")).toHaveAttribute(
        "aria-busy",
        "true",
    );
    await page.evaluate(() =>
        (
            window as Window & { releaseHabitBarrier?: () => void }
        ).releaseHabitBarrier?.(),
    );
    await expect(current(page).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expect(current(second).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    expect(
        (await readStore(page, "habitEntries")).filter(
            (e) => e.localDate === "2026-10-21",
        ),
    ).toHaveLength(1);
    await second.close();
});
test("تصحيحتسجيلقديموخارجالشهرالظاهرلاينسخالسجلويحفظوقتإدخاله", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    const history = page.getByRole("region", {
        name: "سجل العادة",
        exact: true,
    });
    await history.getByLabel("يوم التسجيل", { exact: true }).fill("2026-10-05");
    await expect(
        history.getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        }),
    ).toBeVisible();
    await history
        .getByRole("button", {
            name: "التراجع عن عادة «ترتيب السرير»",
            exact: true,
        })
        .click();
    let entries = await readStore(page, "habitEntries");
    expect(entries.filter((e) => e.localDate === "2026-10-05")).toHaveLength(1);
    expect(entries[0].recordedAt).toBe("2026-10-05T18:00:00.000Z");
    expect(entries[0].difficulty).toBe("hard");
    await page
        .getByRole("button", { name: "الشهر السابق", exact: true })
        .click();
    await expect(page.locator(".habit-calendar-day")).toHaveCount(30);
    await expect(
        history.getByRole("button", {
            name: "تسجيل عادة «ترتيب السرير»",
            exact: true,
        }),
    ).toBeVisible();
    await history
        .getByRole("button", { name: "تسجيل عادة «ترتيب السرير»", exact: true })
        .click();
    entries = await readStore(page, "habitEntries");
    expect(entries).toHaveLength(1);
    expect(entries[0].result).toEqual({ kind: "simple", done: true });
    await history.getByLabel("يوم التسجيل", { exact: true }).fill("2026-09-30");
    await expect(history.locator(".habit-history-edit button")).toHaveCount(0);
});
test("نقلالعادةبينالمساراتوفصلهايحفظالسجلويظهرالسريانغدًا", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    for (const path of ["culture", "fitness", ""]) {
        await menu(page, "تعديل العادة");
        const d = page.getByRole("dialog");
        await d
            .getByRole("combobox", { name: "المسار", exact: true })
            .selectOption(path);
        await d.getByRole("button", { name: "حفظ", exact: true }).click();
        await expect(page.getByText(/تغيير مخطط من/)).toBeVisible();
    }
    expect(
        (await readStore(page, "habits")).find((h) => h.id === "bed")?.pathId,
    ).toBeNull();
    expect(
        (await readStore(page, "habitPlans")).filter(
            (p) => p.habitId === "bed",
        ),
    ).toHaveLength(4);
    expect(await readStore(page, "habitEntries")).toHaveLength(1);
});
test("الإيقافالمتداخلوالاستئنافلايغيرالسجلولايلغيتوقفالعادة", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/walk"));
    await menu(page, "إيقاف مؤقت");
    await page.goto(appUrl("/#habit-path/culture"));
    await menu(page, "إيقاف مؤقت");
    await menu(page, "استئناف");
    await navigateView(page, "home");
    await expect(
        page
            .getByRole("region", { name: "عاداتي اليوم" })
            .getByText("المشي الخفيف", { exact: true }),
    ).toHaveCount(0);
    await page.goto(appUrl("/#habit/walk"));
    await menu(page, "استئناف");
    await expect(
        current(page).getByText("يوم محايد · التسجيل اختياري"),
    ).toBeVisible();
    await current(page).getByRole("button").click();
    expect(
        (await readStore(page, "habitEntries")).some(
            (e) => e.habitId === "walk",
        ),
    ).toBe(true);
});
test("أرشفةواستعادةالمساروالعادةمحافظتانوتتطلبالأرشفةتأكيدًا", async ({
    page,
}) => {
    await seed(page);
    const entries = await readStore(page, "habitEntries");
    await page.goto(appUrl("/#habit-path/culture"));
    await menu(page, "أرشفة المسار");
    await expect(
        page.getByRole("dialog").getByText(/تصبح عاداته الحالية مستقلة/),
    ).toBeVisible();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد الأرشفة", exact: true })
        .click();
    await expect(
        page.getByText("مسار مؤرشف؛ بقيت عاداته مستقلة وسجلاته محفوظة."),
    ).toBeVisible();
    expect(
        (await readStore(page, "habits")).find((h) => h.id === "walk")?.pathId,
    ).toBeNull();
    await menu(page, "استعادة المسار");
    await expect(
        page.getByRole("heading", { name: "المسار الثقافي", exact: true }),
    ).toBeVisible();
    expect(await readStore(page, "habitEntries")).toEqual(entries);
    await page.goto(appUrl("/#habit/bed"));
    await menu(page, "أرشفة العادة");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد الأرشفة", exact: true })
        .click();
    await menu(page, "استعادة العادة");
    await expect(
        page.getByText("موقوفة مؤقتًا", { exact: true }).first(),
    ).toBeVisible();
});
test("منتصفالليلودورةاليومالجديدوالأسبوعلايرحلانالتسجيل", async ({ page }) => {
    await seed(page);
    await page.clock.setFixedTime(new Date("2026-10-21T20:59:59Z"));
    await page.goto(appUrl("/#habit/bed"));
    await current(page).getByRole("button").click();
    await page.clock.setFixedTime(new Date("2026-10-21T21:00:01Z"));
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    await expect(current(page).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "false",
    );
    await current(page).getByRole("button").click();
    expect(
        (await readStore(page, "habitEntries")).filter((e) =>
            ["2026-10-21", "2026-10-22"].includes(String(e.localDate)),
        ),
    ).toHaveLength(2);
    await page.clock.setFixedTime(new Date("2026-10-22T21:00:01Z"));
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    await navigateView(page, "home");
    const card = page.getByRole("region", { name: "عاداتي اليوم" });
    await expect(card.getByText("ترتيب السرير", { exact: true })).toHaveCount(
        0,
    );
    await expect(card.getByText("المشي الخفيف", { exact: true })).toBeVisible();
});
test("الروابطالمباشرةوالرجوعوالتمريروEscapeوالإضافةالعائمةتبقىسليمة", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    await page.getByRole("button", { name: "الرجوع", exact: true }).click();
    await expect(page).toHaveURL(/#habits$/);
    await page.getByRole("link", { name: "ترتيب السرير", exact: true }).click();
    await expect(page).toHaveURL(/#habit\/bed$/);
    await page
        .getByRole("button", { name: "خيارات العادة أو المسار", exact: true })
        .click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
        .getByRole("button", { name: "إضافة سريعة", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "عادة جديدة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(appUrl("/#habit/not-found"));
    await expect(
        page
            .getByRole("heading", { name: "العنصر غير موجود", exact: true })
            .last(),
    ).toBeVisible();
});
test("النسخوالاستعادةتحفظالإنجازوالإيقافاتالجديدةمعالجداولالقديمة", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    await current(page).getByRole("button").click();
    await menu(page, "إيقاف مؤقت");
    await page.goto(appUrl("/#backup"));
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const download = await waiting;
    const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(saved.version).toBe(5);
    expect(saved.habitEntries).toHaveLength(2);
    expect(
        saved.habits.find((h: { id: string }) => h.id === "bed").pauses,
    ).toHaveLength(1);
    await importData(page, saved);
    expect(await readStore(page, "habitEntries")).toEqual(saved.habitEntries);
    expect(await readStore(page, "habits")).toEqual(saved.habits);
});
for (const width of [320, 390, 768, 1366])
    for (const theme of ["light", "dark"]) {
        test(`العرضوالصورRTL ${width} ${theme}`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(
                (mode) => localStorage.setItem("masar-theme", mode),
                theme,
            );
            await seed(page);
            for (const [name, route] of [
                ["paths", "habits"],
                ["path", "habit-path/culture"],
                ["habit", "habit/bed"],
                ["home", "home"],
            ]) {
                await page.goto(appUrl("/#" + route));
                await expect(page.locator(".living-sky")).toBeVisible();
                await settle(page);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page.screenshot({
                    path: `${out}/${name}-${theme}-${width}.png`,
                });
            }
            await page.goto(appUrl("/#habit/bed"));
            await settle(page);
            const touch = current(page).getByRole("button");
            const layout = await touch.evaluate((node) => ({
                width: (node as HTMLElement).offsetWidth,
                height: (node as HTMLElement).offsetHeight,
                cssWidth: parseFloat(getComputedStyle(node).width),
                cssHeight: parseFloat(getComputedStyle(node).height),
            }));
            expect(layout.cssWidth).toBeGreaterThanOrEqual(44);
            expect(layout.cssHeight).toBeGreaterThanOrEqual(44);
            expect(layout.width).toBeGreaterThanOrEqual(44);
            expect(layout.height).toBeGreaterThanOrEqual(44);
            const touchBox = await touch.boundingBox();
            // Chromium can subtract translated fractional coordinates to
            // 43.999992px for a real 44px layout box. Keep the CSS/layout
            // minimum strict; compare painted bounds at subpixel precision.
            expect(touchBox!.width).toBeCloseTo(layout.width, 2);
            expect(touchBox!.height).toBeCloseTo(layout.height, 2);
            await menu(page, "تعديل العادة");
            await settle(page);
            await page.screenshot({
                path: `${out}/form-${theme}-${width}.png`,
            });
            expect(
                await page
                    .getByRole("dialog")
                    .evaluate((n) => n.scrollWidth <= n.clientWidth),
            ).toBe(true);
            const axe = await new AxeBuilder({ page })
                .include(".habit-dialog")
                .analyze();
            expect(axe.violations).toEqual([]);
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toHaveCount(0);
        });
    }
test("فتحوتسجيلسريعانمعقائمةطويلةوإبطاءCPUدونحسابالتاريخكله", async ({
    page,
}) => {
    const d = fixture();
    for (let i = 0; i < 150; i++) {
        d.habits!.push({
            ...d.habits![0],
            id: `load-${i}`,
            title: `عادة ${i}`,
        });
        d.habitPlans!.push({
            ...d.habitPlans![0],
            id: `lp-${i}`,
            habitId: `load-${i}`,
        });
    }
    await importData(page, d);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(appUrl("/#habits"));
    await expect(page.locator(".habit-row")).toHaveCount(30);
    const started = Date.now();
    await page.getByRole("button", { name: "عادة جديدة", exact: true }).click();
    await expect(
        page.getByRole("dialog").getByLabel("اسم العادة", { exact: true }),
    ).toBeVisible();
    const elapsed = Date.now() - started;
    fs.writeFileSync(
        `${out}/performance.json`,
        JSON.stringify(
            {
                habits: 152,
                cpuSlowdown: 4,
                openFormMs: elapsed,
                physicalAndroid: false,
            },
            null,
            2,
        ),
    );
    expect(elapsed).toBeLessThan(2500);
    await page.keyboard.press("Escape");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    for (const count of [60, 90, 120, 150, 151]) {
        await page
            .getByRole("button", { name: /عرض المزيد من العادات/ })
            .click();
        await expect(page.locator(".habit-row")).toHaveCount(count);
    }
});
test("النقرالمتكرروالأرشيفمنعرضاليوموالرابطالمباشر", async ({ page }) => {
    await seed(page);
    await page.goto(appUrl("/#habit/bed"));
    await current(page)
        .getByRole("button")
        .evaluate((button) => {
            for (let i = 0; i < 10; i++) (button as HTMLButtonElement).click();
        });
    await expect(current(page).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    expect(
        (await readStore(page, "habitEntries")).filter(
            (e) => e.localDate === "2026-10-21",
        ),
    ).toHaveLength(1);
    await menu(page, "أرشفة العادة");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد الأرشفة", exact: true })
        .click();
    await page.goto(appUrl("/#habits/today"));
    await page.getByRole("button", { name: "الأرشيف", exact: true }).click();
    await expect(page).toHaveURL(/#habits\/archive$/);
    await expect(
        page
            .getByRole("region", { name: "العادات المؤرشفة" })
            .getByText("ترتيب السرير", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "الأرشيف", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
});
test("حدودالشهوروالسنةتحدثالتقويموالمطالبةفورعودةالتطبيق", async ({ page }) => {
    await seed(page);
    await page.clock.setFixedTime(new Date("2026-12-31T20:59:59Z"));
    await page.goto(appUrl("/#habit/walk"));
    await expect(page.locator(".habit-month-nav strong")).toHaveText(
        "ديسمبر 2026",
    );
    await current(page).getByRole("button").click();
    await page.clock.setFixedTime(new Date("2026-12-31T21:00:01Z"));
    await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.locator(".habit-month-nav strong")).toHaveText(
        "يناير 2027",
    );
    await expect(current(page).getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "false",
    );
    expect(
        (await readStore(page, "habitEntries")).some(
            (e) => e.localDate === "2026-12-31",
        ),
    ).toBe(true);
});
test("الرجوعمنالتفاصيلومنالرئيسيةيعيدالصفوفالموسعةوموضعالتمرير", async ({
    page,
}) => {
    const d = fixture();
    for (let i = 0; i < 60; i++) {
        d.habits!.push({
            ...d.habits![0],
            id: `return-${i}`,
            title: `عادة العودة ${i}`,
        });
        d.habitPlans!.push({
            ...d.habitPlans![0],
            id: `return-plan-${i}`,
            habitId: `return-${i}`,
        });
    }
    await importData(page, d);
    await page.goto(appUrl("/#habits"));
    await expect(page.locator(".habit-row")).toHaveCount(30);
    await page.getByRole("button", { name: /عرض المزيد من العادات/ }).click();
    await expect(page.locator(".habit-row")).toHaveCount(60);
    const row = page.locator(".habit-row").nth(50);
    await row.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY);
    await row.locator(".habit-row-copy a").click();
    await expect(page.locator("main")).toHaveAttribute("data-route", "habit");
    await page.getByRole("button", { name: "الرجوع", exact: true }).click();
    await expect(page).toHaveURL(/#habits$/);
    await expect(page.locator(".habit-row")).toHaveCount(60);
    await expect
        .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - y))
        .toBeLessThan(4);
    await navigateView(page, "home");
    await navigateView(page, "habits");
    await expect(page.locator(".habit-row")).toHaveCount(60);
    await expect
        .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - y))
        .toBeLessThan(4);
});
test("تباينرسالةتحميلالسجلأثناءقراءةمعلقةفعليًافيالصباحالداكن", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem("masar-theme", "dark"));
    await page.clock.setFixedTime(new Date("2026-10-21T06:00:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page);
    await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open("masar-v1");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        await new Promise<void>((resolve) => {
            const tx = database.transaction("taskCycles", "readwrite");
            let held = true;
            (
                window as Window & { releaseLoadingProbe?: () => void }
            ).releaseLoadingProbe = () => {
                held = false;
            };
            tx.oncomplete = () => database.close();
            const pump = () => {
                const r = tx
                    .objectStore("taskCycles")
                    .get("only-a-read-barrier-in-test");
                r.onsuccess = () => {
                    if (held) pump();
                };
            };
            pump();
            resolve();
        });
    });
    const results: unknown[] = [];
    try {
        await page.goto(appUrl("/#progress"));
        for (const [key, tab] of [
            ["overview", "نظرة عامة"],
            ["history", "سجل الإنجاز"],
        ]) {
            await page.getByRole("tab", { name: tab, exact: true }).click();
            const status = page
                .locator('main p[role="status"]:visible')
                .filter({ hasText: "قراءة سجل الإنجاز…" })
                .first();
            await expect(status).toBeVisible();
            await status.scrollIntoViewIfNeeded();
            const row = await status.evaluate((node) => {
                const range = document.createRange();
                range.selectNodeContents(node);
                const box = range.getBoundingClientRect(),
                    style = getComputedStyle(node),
                    color = style.color.match(/[\d.]+/g)!.map(Number);
                let alpha = color[3] ?? 1;
                for (
                    let p: HTMLElement | null = node as HTMLElement;
                    p;
                    p = p.parentElement
                )
                    alpha *= Number(getComputedStyle(p).opacity);
                node.classList.add("phase3-loading-probe");
                return {
                    label: node.textContent,
                    rgb: color.slice(0, 3),
                    alpha,
                    required: 4.5,
                    rect: [box.x, box.y, box.right, box.bottom],
                };
            });
            await page.screenshot({
                path: `${out}/progress-loading-${key}-dark-320.png`,
            });
            const style = await page.addStyleTag({
                content:
                    ".phase3-loading-probe{color:transparent!important;text-shadow:none!important}",
            });
            const png = `${out}/loading-background-${key}.png`,
                data = `${out}/loading-${key}.json`;
            fs.writeFileSync(data, JSON.stringify([row]));
            await page.screenshot({ path: png });
            const measured = JSON.parse(
                execFileSync(
                    "python3",
                    ["docs/living-sky-shell/measure-contrast.py", png, data],
                    { encoding: "utf8" },
                ),
            );
            results.push({ tab, measured });
            expect(measured).toHaveLength(1);
            expect(measured[0].passes).toBe(true);
            await style.evaluate((n) => n.parentNode?.removeChild(n));
        }
    } finally {
        await page.evaluate(() =>
            (
                window as Window & { releaseLoadingProbe?: () => void }
            ).releaseLoadingProbe?.(),
        );
    }
    await expect(
        page
            .locator('main p[role="status"]:visible')
            .filter({ hasText: "قراءة سجل الإنجاز…" }),
    ).toHaveCount(0);
    fs.writeFileSync(
        `${out}/loading-contrast.json`,
        JSON.stringify(results, null, 2),
    );
});
