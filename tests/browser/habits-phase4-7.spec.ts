import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { readStore, setHabitQuantity } from "./helpers";
const out = "docs/habits-phase4-7";
fs.mkdirSync(out, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
});
async function graded(page: Page) {
    await page.goto(appUrl("/#habits"));
    await page.getByRole("button", { name: "عادة جديدة", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("اسم العادة", { exact: true }).fill("قراءة كمية");
    await dialog
        .getByRole("button", { name: "كمية متدرجة", exact: true })
        .click();
    await dialog
        .getByText("المراحل والوحدات والهدف النهائي", { exact: true })
        .click();
    await dialog.getByLabel("اسم المرحلة", { exact: true }).fill("قراءة");
    await dialog.getByLabel("وحدة القياس", { exact: true }).fill("صفحة");
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(dialog).toHaveCount(0);
}
for (const width of [320, 390])
    for (const theme of ["light", "dark"])
        test(`phase4 graded CRUD and home ${width} ${theme}`, async ({
            page,
            context,
        }) => {
            const errors: string[] = [];
            page.on("pageerror", (e) => errors.push(e.message));
            await page.addInitScript(
                (t) => localStorage.setItem("masar-theme", t),
                theme,
            );
            await page.setViewportSize({ width, height: 844 });
            await graded(page);
            const id = (await readStore(page, "habits"))[0].id;
            await page.goto(appUrl(`/#habit/${id}`));
            const row = page.locator(".habit-detail > .habit-row");
            await setHabitQuantity(row, "قراءة كمية", "5");
            await row
                .getByRole("button", { name: "سجّل", exact: true })
                .click();
            await expect(
                row.getByRole("button", { name: "تراجع", exact: true }),
            ).toBeVisible();
            expect(
                (await readStore(page, "habitEntries"))[0].result,
            ).toMatchObject({ amount: 5, threshold: 1, unit: "صفحة" });
            await page.locator(".habit-evolution summary").click();
            await page.screenshot({
                path: `${out}/phase4-habit-${theme}-${width}.png`,
                fullPage: true,
                animations: "disabled",
            });
            await page.goto(appUrl("/#home"));
            const home = page.getByRole("region", {
                name: "عاداتي اليوم",
                exact: true,
            });
            await expect(home.locator(".count")).toHaveText("1/1");
            await home
                .getByRole("button", { name: "تراجع", exact: true })
                .click();
            await expect(home.locator(".count")).toHaveText("0/1");
            await setHabitQuantity(home, "قراءة كمية", "3");
            await home
                .getByRole("button", { name: "سجّل", exact: true })
                .click();
            await expect(home.locator(".count")).toHaveText("1/1");
            await page.reload();
            await expect(home.locator(".count")).toHaveText("1/1");
            await context.setOffline(true);
            await page.reload();
            await expect(home.locator(".count")).toHaveText("1/1");
            await context.setOffline(false);
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            expect(errors).toEqual([]);
        });

const habitFile = {
    format: "masar.habits",
    version: 1,
    kind: "path",
    path: {
        title: "مسار مستورد",
        habits: [
            {
                key: "reading",
                title: "قراءة مستوردة",
                kind: "progressive",
                schedule: { repeat: "daily" },
                phases: [
                    {
                        key: "pages",
                        title: "قراءة",
                        unit: "صفحة",
                        start: 1,
                        goal: 20,
                        step: 1,
                    },
                ],
                current: { phaseKey: "pages", target: 1 },
            },
            {
                key: "bed",
                title: "سرير مستورد",
                kind: "simple",
                schedule: { repeat: "daily" },
            },
        ],
    },
};
async function uploadHabits(page: Page, value: unknown = habitFile) {
    await page
        .getByRole("button", { name: "استيراد عادات", exact: true })
        .click();
    await page.getByLabel("ملف JSON للعادات").setInputFiles({
        name: "habits.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(value)),
    });
}
for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
] as const)
    test(`phase5 import preview duplicate and validation ${width} ${theme}`, async ({
        page,
    }) => {
        await page.addInitScript(
            (t) => localStorage.setItem("masar-theme", t),
            theme,
        );
        await page.setViewportSize({ width, height: 844 });
        await page.goto(appUrl("/#habits"));
        await uploadHabits(page, { ...habitFile, version: 2 });
        await expect(page.getByRole("alert")).toContainText("الإصدار1");
        expect(await readStore(page, "habits")).toHaveLength(0);
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إلغاء", exact: true })
            .click();
        await uploadHabits(page);
        await expect(
            page.getByRole("region", { name: "معاينة استيراد العادات" }),
        ).toContainText("صفحة");
        await page.screenshot({
            path: `${out}/phase5-import-${theme}-${width}.png`,
            fullPage: true,
            animations: "disabled",
        });
        await page
            .getByRole("button", { name: "تأكيد استيراد العادات", exact: true })
            .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
            page.getByRole("heading", { name: "مسار مستورد", exact: true }),
        ).toBeVisible();
        expect(await readStore(page, "habits")).toHaveLength(2);
        await page.goto(appUrl("/#habits"));
        await uploadHabits(page);
        await page
            .getByRole("button", { name: "تأكيد استيراد العادات", exact: true })
            .click();
        await expect(page.getByRole("alert")).toContainText("مستورد بالفعل");
        expect(await readStore(page, "habits")).toHaveLength(2);
        await page
            .getByRole("checkbox", {
                name: "أوافق على إنشاء نسخة إضافية مستقلة",
            })
            .check();
        await page
            .getByRole("button", { name: "تأكيد استيراد العادات", exact: true })
            .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await readStore(page, "habits")).toHaveLength(4);
        await page.goto(appUrl("/#habits"));
        await uploadHabits(page);
        await page
            .getByText("تعديل المحتوى قبل الاستيراد", { exact: true })
            .click();
        const edited = structuredClone(habitFile);
        edited.path.title = "مسار بعد التعديل";
        await page
            .getByLabel("JSON القابل للتعديل")
            .fill(JSON.stringify(edited));
        await expect(
            page.getByRole("button", {
                name: "تأكيد استيراد العادات",
                exact: true,
            }),
        ).toBeDisabled();
        await page
            .getByRole("button", {
                name: "تحديث المعاينة والتحقق",
                exact: true,
            })
            .click();
        await page
            .getByRole("button", { name: "تأكيد استيراد العادات", exact: true })
            .click();
        await expect(
            page.getByRole("heading", {
                name: "مسار بعد التعديل",
                exact: true,
            }),
        ).toBeVisible();
        expect(await readStore(page, "habitEntries")).toHaveLength(0);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    });

for (const [width, theme] of [
    [320, "dark"],
    [390, "light"],
] as const)
    test(`phase6 reminders CRUD and ideas regression ${width} ${theme}`, async ({
        page,
        context,
    }) => {
        await page.addInitScript(
            (t) => localStorage.setItem("masar-theme", t),
            theme,
        );
        await page.setViewportSize({ width, height: 844 });
        await page.goto(appUrl("/#ideas"));
        const capture = page.locator(".idea-capture-details");
        await capture.locator("summary").click();
        await capture.getByRole("textbox").first().fill("فكرة أصلية");
        await capture
            .getByRole("button", { name: "حفظ الفكرة", exact: true })
            .click();
        await expect(page.locator(".idea-card").first()).toContainText(
            "فكرة أصلية",
        );
        const ideasBefore = await readStore(page, "ideas");
        await page
            .getByRole("button", { name: "تذكيرات", exact: true })
            .click();
        await expect(page).toHaveURL(/#ideas\/reminders$/);
        const area = page.getByRole("region", {
            name: "التذكيرات",
            exact: true,
        });
        await area
            .getByLabel("عنوان التذكير", { exact: true })
            .fill("كتاب للتذكّر");
        await area
            .getByRole("button", { name: "حفظ سريع", exact: true })
            .click();
        await expect(area.locator(".reminder-row")).toHaveCount(1);
        await area
            .getByRole("button", {
                name: "خيارات التذكير «كتاب للتذكّر»",
                exact: true,
            })
            .click();
        await page
            .getByRole("button", { name: "تعديل التذكير", exact: true })
            .click();
        await page
            .getByRole("dialog")
            .getByLabel("عنوان التذكير", { exact: true })
            .fill("كتاب معدل");
        await page
            .getByLabel("تصنيف التذكير", { exact: true })
            .selectOption("book");
        await page
            .getByRole("button", { name: "حفظ التذكير", exact: true })
            .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await area
            .getByRole("button", { name: "مراجعة «كتاب معدل»", exact: true })
            .click();
        await expect(
            area.getByRole("button", {
                name: "التراجع عن مراجعة «كتاب معدل»",
                exact: true,
            }),
        ).toHaveAttribute("aria-pressed", "true");
        await page.screenshot({
            path: `${out}/phase6-reminders-${theme}-${width}.png`,
            fullPage: true,
            animations: "disabled",
        });
        await page.reload();
        await expect(area).toContainText("كتاب معدل");
        await context.setOffline(true);
        await page.reload();
        await expect(area).toContainText("كتاب معدل");
        await context.setOffline(false);
        await area
            .getByRole("button", {
                name: "التراجع عن مراجعة «كتاب معدل»",
                exact: true,
            })
            .click();
        await expect(
            area.getByRole("button", {
                name: "مراجعة «كتاب معدل»",
                exact: true,
            }),
        ).toHaveAttribute("aria-pressed", "false");
        await area
            .getByRole("button", {
                name: "خيارات التذكير «كتاب معدل»",
                exact: true,
            })
            .click();
        await page
            .getByRole("button", { name: "حذف التذكير", exact: true })
            .click();
        await page
            .getByRole("button", { name: "تأكيد حذف التذكير", exact: true })
            .click();
        await expect(area.locator(".reminder-row")).toHaveCount(0);
        await page
            .getByRole("button", { name: "الأفكار", exact: true })
            .click();
        await expect(page.locator(".idea-card").first()).toContainText(
            "فكرة أصلية",
        );
        expect(await readStore(page, "ideas")).toEqual(ideasBefore);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    });

async function adviceSeed(page: Page) {
    const { habitFixture } = await import("../habitFixtures");
    const { importData } = await import("./helpers");
    const s = habitFixture(),
        h = s.habits![0],
        p = s.habitPlans![0];
    s.habits = [h];
    s.habitPlans = [p];
    s.habitSuggestions = [];
    s.habitImportReceipts = [];
    s.habitEntries = Array.from({ length: 7 }, (_, i) => {
        const date = `2026-10-${14 + i}`;
        return {
            id: "proof-" + i,
            habitId: h.id,
            planId: p.id,
            localDate: date,
            dayStart: `2026-10-${13 + i}T21:00:00.000Z`,
            dayEnd: date + "T21:00:00.000Z",
            timeZone: h.timeZone,
            recordedAt: date + "T10:00:00.000Z",
            updatedAt: date + "T10:00:00.000Z",
            result: {
                kind: "graded" as const,
                phaseKey: "pages",
                unit: "صفحات",
                threshold: 1,
                amount: 1,
            },
            difficulty: "easy" as const,
        };
    });
    await importData(page, s);
    await page.goto(appUrl("/#habit/reading"));
    await expect(
        page
            .getByRole("region", { name: "توصيات العادة", exact: true })
            .getByRole("button", { name: "معاينة الأثر", exact: true }),
    ).toBeVisible();
}
for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
] as const)
    test(`phase7 advice explicit preview accept undo and summaries ${width} ${theme}`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(
            (t) => localStorage.setItem("masar-theme", t),
            theme,
        );
        await adviceSeed(page);
        const panel = page.getByRole("region", {
            name: "توصيات العادة",
            exact: true,
        });
        expect(await readStore(page, "habitPlans")).toHaveLength(1);
        await panel
            .getByRole("button", { name: "معاينة الأثر", exact: true })
            .click();
        await expect(page.getByRole("dialog")).toContainText("من الغد");
        await page.screenshot({
            path: `${out}/phase7-advice-preview-${theme}-${width}.png`,
            animations: "disabled",
        });
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إلغاء", exact: true })
            .click();
        expect(await readStore(page, "habitPlans")).toHaveLength(1);
        await panel
            .getByRole("button", { name: "رفض الاقتراح", exact: true })
            .click();
        await expect(
            panel.getByRole("button", { name: "معاينة الأثر", exact: true }),
        ).toHaveCount(0);
        await page.reload();
        await expect(panel).toContainText("لا اقتراح جديد");
        expect(await readStore(page, "habitPlans")).toHaveLength(1);
        // A changed evaluation has a new basis but cannot repeat the rejected same action without material evidence.
        await panel.locator("summary").click();
        await panel
            .getByRole("spinbutton", {
                name: "عتبة اقتراح التطور",
                exact: true,
            })
            .fill("7");
        await expect(
            panel.getByRole("button", { name: "معاينة الأثر", exact: true }),
        ).toHaveCount(0);
        await page.goto(appUrl("/#home"));
        for (const details of await page
            .locator(".home-summaries .home-secondary")
            .all())
            await details.locator(":scope > summary").click();
        await expect(
            page.getByRole("region", {
                name: "ملخص المسارات النشطة",
                exact: true,
            }),
        ).toContainText("المسار الثقافي");
        await expect(
            page.getByRole("region", {
                name: "ملخص الأفكار والتذكيرات",
                exact: true,
            }),
        ).toContainText("كتاب للمراجعة");
        await expect(
            page.getByRole("region", {
                name: "ملخص التقدم العام",
                exact: true,
            }),
        ).toContainText("مهام منجزة هذا الأسبوع");
        await page.screenshot({
            path: `${out}/phase7-home-${theme}-${width}.png`,
            fullPage: true,
            animations: "disabled",
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        expect(errors).toEqual([]);
    });
test("phase7 accepts only confirmed current recommendation, keeps today threshold and history", async ({
    page,
}) => {
    await adviceSeed(page);
    const old = {};
    for (const n of ["tasks", "projects", "ideas", "taskCycles"])
        Object.assign(old, {
            [n]: await readStore(page, n as Parameters<typeof readStore>[1]),
        });
    const panel = page.getByRole("region", {
        name: "توصيات العادة",
        exact: true,
    });
    await panel
        .getByRole("button", { name: "معاينة الأثر", exact: true })
        .click();
    await page
        .getByRole("button", { name: "أوافق على هذا التغيير", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const plans = await readStore(page, "habitPlans");
    expect(plans).toHaveLength(2);
    expect(plans.find((p) => p.revision === 2)).toMatchObject({
        effectiveDate: "2026-10-22",
        current: { target: 2 },
    });
    await page.goto(appUrl("/#home"));
    const home = page.getByRole("region", {
        name: "عاداتي اليوم",
        exact: true,
    });
    await setHabitQuantity(home, "قراءة", "1");
    await home.getByRole("button", { name: "سجّل", exact: true }).click();
    await expect(home.locator(".count")).toHaveText("1/1");
    expect(
        (await readStore(page, "habitEntries")).find(
            (e) => e.localDate === "2026-10-21",
        )?.result,
    ).toMatchObject({ amount: 1, threshold: 1 });
    await home.getByRole("button", { name: "تراجع", exact: true }).click();
    await expect(home.locator(".count")).toHaveText("0/1");
    for (const [n, rows] of Object.entries(old))
        expect(
            await readStore(page, n as Parameters<typeof readStore>[1]),
        ).toEqual(rows);
    await page.clock.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    await page.reload();
    await setHabitQuantity(home, "قراءة", "2");
    await home.getByRole("button", { name: "سجّل", exact: true }).click();
    await expect(home.locator(".count")).toHaveText("1/1");
    expect(
        (await readStore(page, "habitEntries")).find(
            (e) => e.localDate === "2026-10-22",
        )?.result,
    ).toMatchObject({ amount: 2, threshold: 2 });
    expect(
        (await readStore(page, "habitSuggestions")).filter(
            (s) => s.status === "accepted",
        ),
    ).toHaveLength(1);
});
