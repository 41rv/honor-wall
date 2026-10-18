import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { appUrl } from "./url";
import { importData, readStore, navigateView } from "./helpers";
import { habitFixture } from "../habitFixtures";
import type { Snapshot } from "../../app/model";
const out = "docs/experience-phase1";
fs.mkdirSync(out, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const e: string[] = [];
    errors.set(page, e);
    page.on("pageerror", (x) => e.push(x.message));
    page.on("console", (m) => {
        if (m.type() === "error") e.push(m.text());
    });
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
function fixture(): Snapshot {
    const d: Snapshot = Object.assign(
        habitFixture(),
        JSON.parse(
            fs.readFileSync("docs/habits-phase8/schema6-fixture.json", "utf8"),
        ),
        { version: 5 },
    );
    d.habitSuggestions = d.habitSuggestions!.filter((s) => s.status !== "new");
    return d;
}
async function seed(page: Page, data = fixture()) {
    await importData(page, data);
    const toast = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await toast.isVisible()) await toast.click();
    await page.goto(appUrl("/#home"));
    await expect(
        page.getByRole("region", { name: "عاداتي اليوم", exact: true }),
    ).toBeVisible();
}
async function menu(page: Page) {
    await page
        .getByRole("button", { name: "خيارات العادة أو المسار", exact: true })
        .click();
}
async function deletion(page: Page, route: string) {
    await page.goto(appUrl("/#" + route));
    await menu(page);
    await page.getByRole("button", { name: "حذف نهائي", exact: true }).click();
    return page.getByRole("dialog");
}
for (const width of [320, 390, 768, 1366])
    for (const theme of ["light", "dark"])
        test(`daily polish slider draft feedback and shortcuts ${width} ${theme}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(
                (t) => localStorage.setItem("masar-theme", t),
                theme,
            );
            await seed(page);
            const overview = page.getByRole("navigation", {
                name: "ملخص يومك",
                exact: true,
            });
            await expect(overview).toBeVisible();
            const home = page.getByRole("region", {
                name: "عاداتي اليوم",
                exact: true,
            });
            const row = home.locator('[data-habit-id="reading"]');
            const before = await readStore(page, "habitEntries");
            const slider = row.getByRole("slider", {
                name: "شريط كمية «قراءة»",
                exact: true,
            });
            await expect(slider).toHaveValue("2");
            await slider.fill("4");
            await slider.focus();
            await page.keyboard.press("ArrowRight");
            await expect(slider).toHaveValue("5");
            expect(await readStore(page, "habitEntries")).toEqual(before);
            await row
                .getByRole("button", { name: "إلغاء التعديل", exact: true })
                .click();
            await expect(slider).toHaveValue("2");
            await row
                .getByRole("button", {
                    name: "زيادة كمية «قراءة»",
                    exact: true,
                })
                .click();
            await expect(slider).toHaveValue("3");
            await row
                .getByRole("button", { name: "سجّل", exact: true })
                .click();
            await expect(home.locator(".count")).toHaveText("1/2");
            let entries = await readStore(page, "habitEntries");
            const record = entries.find(
                (e) => e.habitId === "reading" && e.localDate === "2026-10-21",
            )!;
            expect(record.result).toMatchObject({ amount: 3, threshold: 2 });
            expect(record.effortRating).toBeUndefined();
            expect(record.durationMinutes).toBeUndefined();
            const feedback = row.locator(".habit-feedback");
            await feedback.locator("summary").click();
            await feedback
                .getByLabel("صعوبة الأداء", { exact: true })
                .selectOption("4");
            await feedback
                .getByLabel("المدة الفعلية بالدقائق", { exact: true })
                .fill("6.5");
            expect(
                (await readStore(page, "habitEntries")).find(
                    (e) => e.id === record.id,
                )?.effortRating,
            ).toBeUndefined();
            await feedback
                .getByRole("button", {
                    name: "حفظ التقييم والمدة",
                    exact: true,
                })
                .click();
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "habitEntries")).find(
                            (e) => e.id === record.id,
                        )?.effortRating,
                )
                .toBe(4);
            await page.reload();
            await expect(home.locator(".count")).toHaveText("1/2");
            await row.locator(".habit-feedback summary").click();
            await expect(row.locator(".habit-feedback")).toContainText(
                "6.5 دقيقة فعلية",
            );
            await row
                .locator(".habit-feedback")
                .getByRole("button", { name: "تخطي / إغلاق", exact: true })
                .click();
            await home
                .getByRole("button", {
                    name: "تسجيل عادة «ترتيب السرير»",
                    exact: true,
                })
                .click();
            await expect(home.locator(".count")).toHaveText("2/2");
            const simple = home.locator('[data-habit-id="bed"]');
            await simple.locator(".habit-feedback summary").click();
            await simple
                .getByLabel("صعوبة الأداء", { exact: true })
                .selectOption("1");
            await simple
                .getByRole("button", {
                    name: "حفظ التقييم والمدة",
                    exact: true,
                })
                .click();
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "habitEntries")).find(
                            (e) =>
                                e.habitId === "bed" &&
                                e.localDate === "2026-10-21",
                        )?.effortRating,
                )
                .toBe(1);
            await home
                .getByRole("button", {
                    name: "التراجع عن عادة «ترتيب السرير»",
                    exact: true,
                })
                .click();
            await expect(home.locator(".count")).toHaveText("1/2");
            for (const d of [".home-secondary"])
                expect(await page.locator(d + "[open]").count()).toBe(0);
            await page
                .getByRole("button", {
                    name: "إعادة فتح مهمة يومية قديمة",
                    exact: true,
                })
                .click();
            await expect(
                page.getByRole("button", {
                    name: "إكمال مهمة يومية قديمة",
                    exact: true,
                }),
            ).toBeVisible();
            await page
                .getByRole("button", {
                    name: "إكمال مهمة يومية قديمة",
                    exact: true,
                })
                .click();
            await page
                .locator(".home-summaries .home-secondary")
                .first()
                .locator(":scope > summary")
                .click();
            await expect(
                page.getByRole("region", {
                    name: "ملخص الأفكار والتذكيرات",
                    exact: true,
                }),
            ).toContainText("كتاب للمراجعة");
            await page
                .locator(".home-summaries .home-secondary")
                .first()
                .locator(":scope > summary")
                .click();
            await page.screenshot({
                path: `${out}/home-recorded-${theme}-${width}.png`,
                animations: "disabled",
            });
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            await navigateView(page, "projects");
            await page.locator('.project-gateway a[href="#tasks"]').click();
            await page
                .getByRole("button", { name: "الرجوع", exact: true })
                .click();
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                "projects",
            );
            await page.goto(appUrl("/#habit/reading"));
            const history = page.getByRole("region", {
                name: "سجل العادة",
                exact: true,
            });
            await expect(history).toContainText("4/5");
            await expect(history).toContainText("6.5 دقيقة فعلية");
        });
test("quantity units, large manual alternative, cancellation and precise below-target recording", async ({
    page,
}) => {
    const d = fixture();
    d.habitSuggestions = [];
    for (const p of d.habitPlans!.filter((p) => p.habitId === "reading")) {
        p.phases[0].unit = "خطوة";
        p.phases[0].target = 20000;
        p.current!.target = 5000;
        p.baseline!.target = 100;
    }
    for (const e of d.habitEntries!.filter((e) => e.result.kind === "graded"))
        if (e.result.kind === "graded") {
            e.result.unit = "خطوة";
            e.result.threshold = 5000;
        }
    await seed(page, d);
    const row = page.locator('.home-habits [data-habit-id="reading"]');
    const range = row.getByRole("slider");
    await expect(range).toHaveAttribute("step", "100");
    await range.fill("5100");
    await row
        .getByRole("button", { name: "تقليل كمية «قراءة»", exact: true })
        .click();
    await expect(range).toHaveValue("5000");
    await row.locator(".quantity-manual summary").click();
    await row
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("");
    await expect(range).toHaveValue("0");
    await expect(range).toHaveAttribute("aria-valuetext", "0 خطوة، الهدف 5000");
    await row
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("1000000");
    await row
        .getByRole("button", { name: "إلغاء التعديل", exact: true })
        .click();
    expect(
        (await readStore(page, "habitEntries")).filter(
            (e) => e.localDate === "2026-10-21",
        ),
    ).toHaveLength(0);
    await row
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("0.5");
    await row.getByRole("button", { name: "سجّل", exact: true }).click();
    await expect(page.locator(".home-habits .count")).toHaveText("0/2");
    expect(
        (await readStore(page, "habitEntries")).find(
            (e) => e.localDate === "2026-10-21",
        )?.result,
    ).toMatchObject({ amount: 0.5, threshold: 5000 });
});
test("previous-day feedback edits stay on that entry, skip and close do not write", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/reading"));
    const history = page.getByRole("region", {
        name: "سجل العادة",
        exact: true,
    });
    await history.getByLabel("يوم التسجيل", { exact: true }).fill("2026-10-05");
    const f = history.locator(".habit-feedback");
    await f.locator("summary").click();
    await f.getByLabel("صعوبة الأداء", { exact: true }).selectOption("5");
    await f.getByLabel("المدة الفعلية بالدقائق", { exact: true }).fill("9");
    await f.getByRole("button", { name: "تخطي / إغلاق", exact: true }).click();
    expect(
        (await readStore(page, "habitEntries")).find((e) => e.id === "read1")
            ?.effortRating,
    ).toBeUndefined();
    await f.locator("summary").click();
    await expect(f.getByLabel("صعوبة الأداء", { exact: true })).toHaveValue(
        "legacy",
    );
    await f.getByLabel("صعوبة الأداء", { exact: true }).selectOption("3");
    await f
        .getByRole("button", { name: "حفظ التقييم والمدة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "habitEntries")).find(
                    (e) => e.id === "read1",
                )?.effortRating,
        )
        .toBe(3);
    expect(
        (await readStore(page, "habitEntries")).find((e) => e.id === "read2")
            ?.effortRating,
    ).toBeUndefined();
});
test("permanent habit deletion cancellation, archived item, cleanup and unaffected legacy data", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const data = fixture();
    data.habits!.find((h) => h.id === "reading")!.title =
        "قراءة" + "غ".repeat(295);
    await seed(page, data);
    const legacy = await readStore(page, "tasks");
    await page.goto(appUrl("/#habit/reading"));
    await menu(page);
    await page
        .getByRole("button", { name: "أرشفة العادة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تأكيد الأرشفة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let d = await deletion(page, "habit/reading");
    await expect(d).toContainText("قراءة");
    await expect(d).toContainText("2 تسجيلات");
    await expect(
        d.getByRole("button", { name: "تأكيد الحذف النهائي", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    expect(await readStore(page, "habits")).toHaveLength(2);
    d = await deletion(page, "habit/reading");
    expect(
        await d.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await d.getByRole("checkbox").check();
    await page.screenshot({
        path: `${out}/delete-habit-long-320.png`,
        animations: "disabled",
    });
    await d
        .getByRole("button", { name: "تأكيد الحذف النهائي", exact: true })
        .click();
    await expect(page).toHaveURL(/#habits$/);
    expect((await readStore(page, "habits")).map((h) => h.id)).toEqual(["bed"]);
    expect((await readStore(page, "habitEntries")).map((e) => e.id)).toEqual([
        "bed1",
    ]);
    expect(await readStore(page, "tasks")).toEqual(legacy);
    await page.reload();
    expect(await readStore(page, "habits")).toHaveLength(1);
});
for (const mode of ["keep", "cascade", "archived"] as const)
    test(`path deletion ${mode}, safety and retained histories`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 844 });
        await seed(page);
        const originalEntries = await readStore(page, "habitEntries");
        if (mode === "archived") {
            await page.goto(appUrl("/#habit-path/culture"));
            await menu(page);
            await page
                .getByRole("button", { name: "أرشفة المسار", exact: true })
                .click();
            await page
                .getByRole("button", { name: "تأكيد الأرشفة", exact: true })
                .click();
            await expect(page.getByRole("dialog")).toHaveCount(0);
        }
        const d = await deletion(page, "habit-path/culture");
        if (mode !== "keep")
            await d
                .getByRole("radio", {
                    name: "حذف المسار وعاداته المرتبطة حاليًا نهائيًا",
                    exact: true,
                })
                .check();
        await expect(d).toContainText("المسار الثقافي");
        await d.getByRole("checkbox").check();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: `${out}/delete-path-${mode}-320.png`,
            animations: "disabled",
        });
        await d
            .getByRole("button", { name: "تأكيد الحذف النهائي", exact: true })
            .click();
        await expect(page).toHaveURL(/#habits$/);
        expect(await readStore(page, "habitPaths")).toHaveLength(0);
        expect(
            (await readStore(page, "habitPlans")).every(
                (p) => p.pathId === null,
            ),
        ).toBe(true);
        if (mode === "cascade") {
            expect((await readStore(page, "habits")).map((h) => h.id)).toEqual([
                "bed",
            ]);
        } else {
            expect(await readStore(page, "habitEntries")).toEqual(
                originalEntries,
            );
            expect(
                (await readStore(page, "habits")).find(
                    (h) => h.id === "reading",
                )?.pathId,
            ).toBeNull();
        }
    });
test("backup actual download validates new feedback, restore preview and conservative old restore", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#habit/reading"));
    const history = page.getByRole("region", {
        name: "سجل العادة",
        exact: true,
    });
    await history.getByLabel("يوم التسجيل", { exact: true }).fill("2026-10-05");
    await history.locator(".habit-feedback summary").click();
    await history.getByLabel("صعوبة الأداء", { exact: true }).selectOption("2");
    await history
        .getByLabel("المدة الفعلية بالدقائق", { exact: true })
        .fill("4");
    await history
        .getByRole("button", { name: "حفظ التقييم والمدة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "habitEntries")).find(
                    (e) => e.id === "read1",
                )?.durationMinutes,
        )
        .toBe(4);
    await page.goto(appUrl("/#backup"));
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const file = await (await download).path();
    const backup = JSON.parse(fs.readFileSync(file!, "utf8"));
    expect(backup.version).toBe(6);
    expect(
        backup.habitEntries.find((e: { id: string }) => e.id === "read1"),
    ).toMatchObject({
        effortRating: 2,
        durationMinutes: 4,
        difficulty: "easy",
    });
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "feedback.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByRole("dialog")).toContainText(
        "معاينة النسخة الاحتياطية",
    );
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const before = await readStore(page, "habitEntries");
    const old = JSON.parse(
        fs.readFileSync("docs/habits-phase8/schema6-fixture.json", "utf8"),
    );
    await importData(page, old);
    expect(await readStore(page, "habitEntries")).toEqual(before);
});
test("accessibility and reduced motion cover slider, feedback and destructive confirmation", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page);
    const home = page.locator(".home-habits");
    await home.getByRole("button", { name: "سجّل", exact: true }).click();
    await expect(home.locator(".count")).toHaveText("1/2");
    await home.locator(".habit-feedback summary").click();
    expect(
        (
            await new AxeBuilder({ page })
                .include("main")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
        ).violations,
    ).toEqual([]);
    const d = await deletion(page, "habit-path/culture");
    await expect(d).toBeVisible();
    expect(
        (
            await new AxeBuilder({ page })
                .include("dialog")
                .withTags(["wcag2a", "wcag2aa"])
                .analyze()
        ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
});

test("rating stays reachable when a completed habit leaves the first three rows", async ({
    page,
}) => {
    const d = fixture(),
        base = habitFixture();
    d.habitPaths = [];
    d.habitEntries = [];
    d.habitSuggestions = [];
    d.habitImportReceipts = [];
    d.habits = Array.from({ length: 4 }, (_, i) => ({
        ...base.habits![1],
        id: "quick" + i,
        title: "عادة " + i,
    }));
    d.habitPlans = d.habits.map((h, i) => ({
        ...base.habitPlans![2],
        id: "quick-plan" + i,
        habitId: h.id,
        schedule: { repeat: "daily" },
    }));
    await seed(page, d);
    const home = page.getByRole("region", {
        name: "عاداتي اليوم",
        exact: true,
    });
    await home
        .getByRole("button", { name: "تسجيل عادة «عادة 0»", exact: true })
        .click();
    await expect(home.locator(".count")).toHaveText("1/4");
    await expect(home.locator(".habit-row")).toHaveCount(3);
    const feedback = home.getByRole("region", {
        name: "تقييم آخر تسجيل",
        exact: true,
    });
    await expect(feedback).toContainText("عادة 0");
    await feedback.locator("summary").click();
    await feedback
        .getByLabel("صعوبة الأداء", { exact: true })
        .selectOption("2");
    await feedback
        .getByRole("button", { name: "حفظ التقييم والمدة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "habitEntries")).find(
                    (e) => e.habitId === "quick0",
                )?.effortRating,
        )
        .toBe(2);
    await home
        .getByRole("button", { name: "تسجيل عادة «عادة 1»", exact: true })
        .click();
    await expect(home.locator(".home-record-feedback")).toHaveCount(1);
    await expect(feedback).toContainText("عادة 1");
    await page.reload();
    await expect(home.locator(".home-record-feedback")).toHaveCount(0);
    expect(
        (await readStore(page, "habitEntries")).find(
            (e) => e.habitId === "quick0",
        )?.effortRating,
    ).toBe(2);
});

test("live deletion preview invalidates prior consent when another tab records new history", async ({
    page,
}) => {
    await seed(page);
    const dialog = await deletion(page, "habit/reading");
    await expect(dialog).toContainText("2 تسجيلات");
    await dialog.getByRole("checkbox").check();
    const other = await page.context().newPage();
    await other.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    try {
        await other.goto(appUrl("/#habit/reading"));
        await other
            .locator(".habit-detail .graded-record")
            .getByRole("button", { name: "سجّل", exact: true })
            .click();
        await expect(dialog).toContainText("3 تسجيلات");
        await expect(dialog.getByRole("checkbox")).not.toBeChecked();
        await expect(
            dialog.getByRole("button", {
                name: "تأكيد الحذف النهائي",
                exact: true,
            }),
        ).toBeDisabled();
        expect(
            (await readStore(page, "habitEntries")).filter(
                (e) => e.habitId === "reading",
            ),
        ).toHaveLength(3);
        await dialog.getByRole("checkbox").check();
        await dialog
            .getByRole("button", { name: "تأكيد الحذف النهائي", exact: true })
            .click();
        await expect(dialog).toHaveCount(0);
        expect(
            (await readStore(page, "habitEntries")).filter(
                (e) => e.habitId === "reading",
            ),
        ).toHaveLength(0);
    } finally {
        await other.close();
    }
});
