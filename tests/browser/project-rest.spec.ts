import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { importData, sizedFixture, readStore, openCreate } from "./helpers";
import fs from "node:fs";
const clock = "2026-10-01T09:00:00.000Z";
test.use({ timezoneId: "UTC" });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(clock) });
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") list.push(m.text());
    });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
async function settings(page: Page) {
    await page.goto(appUrl("/#backup"));
    const section = page.locator(".project-rest-settings");
    if ((await section.getAttribute("open")) === null)
        await section.locator("summary").click();
    return section;
}
async function selectDays(page: Page, names: string[]) {
    const section = await settings(page);
    for (const checkbox of await section.getByRole("checkbox").all())
        await checkbox.setChecked(
            names.includes(
                (await checkbox.getAttribute("aria-label")) ??
                    (await checkbox.evaluate((el) =>
                        el.parentElement!.textContent!.trim(),
                    )),
            ),
        );
    await section
        .getByRole("button", { name: "حفظ أيام الراحة", exact: true })
        .click();
    await expect(section.getByRole("status").last()).toContainText(
        "حُفظت أيام الراحة",
    );
}
async function setup(page: Page, count = 40) {
    const data = sizedFixture(count);
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const x of group) {
            x.createdAt = clock;
            x.updatedAt = clock;
        }
    await importData(page, data);
    await page.goto(appUrl("/#project/p"));
    await page
        .getByRole("button", { name: "إعداد الهدف الزمني", exact: true })
        .click();
    const d = page.getByRole("dialog", {
        name: "هدف المشروع الزمني",
        exact: true,
    });
    await d.getByLabel("نوع الهدف").selectOption("duration");
    await d.getByLabel("المدة بالأيام", { exact: true }).fill("20");
    await d.getByRole("button", { name: "حفظ الهدف", exact: true }).click();
    await expect(d).not.toBeVisible();
}
async function jump(page: Page, at: string) {
    await page.clock.setSystemTime(new Date(at));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("افتراضي الراحة والتعديل وحفظ السجل وإعادة التحميل وإلغاء جميع الأيام", async ({
    page,
}) => {
    let section = await settings(page);
    await expect(
        section.getByRole("checkbox", { name: "الجمعة", exact: true }),
    ).toBeChecked();
    await expect(
        section.getByRole("checkbox", { name: "السبت", exact: true }),
    ).toBeChecked();
    await expect(section.getByRole("checkbox", { checked: true })).toHaveCount(
        2,
    );
    await section
        .getByRole("checkbox", { name: "الأربعاء", exact: true })
        .check();
    await section
        .getByRole("button", { name: "حفظ أيام الراحة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (
                    (await readStore(page, "paceSettings"))[0].restHistory as {
                        days: number[];
                    }[]
                ).at(-1)!.days,
        )
        .toEqual([3, 5, 6]);
    await page.reload();
    section = page.locator(".project-rest-settings");
    await section.locator("summary").click();
    await expect(
        section.getByRole("checkbox", { name: "الأربعاء", exact: true }),
    ).toBeChecked();
    await selectDays(page, []);
    await page.goto(appUrl("/#home"));
    await expect(page.locator(".project-rest-notice")).toHaveCount(0);
    expect(
        (
            (await readStore(page, "paceSettings"))[0].restHistory as {
                days: number[];
            }[]
        ).at(-1)!.days,
    ).toEqual([]);
});
test("40/20 =14 يوم عمل: الهدف ثابت والتوزيع يتحدث عند تغيير الراحة", async ({
    page,
}) => {
    await setup(page);
    const panel = page.getByLabel("وتيرة المشروع", { exact: true });
    await expect(panel).toContainText(
        "14 أيام عمل متبقية ضمن 20 يومًا تقويميًا",
    );
    await expect(panel).toContainText("2026-10-20");
    const target = (
        (await readStore(page, "projectPlans"))[0].goal as {
            targetDate: string;
        }
    ).targetDate;
    await selectDays(page, []);
    await page.goto(appUrl("/#project/p"));
    await expect(panel).toContainText("2 خطوة / يوم عمل");
    expect(
        (
            (await readStore(page, "projectPlans"))[0].goal as {
                targetDate: string;
            }
        ).targetDate,
    ).toBe(target);
});
test("كل الأسبوع راحة: تحذير وحفظ وغياب الاقتراحات دون إيقاف أو تمديد", async ({
    page,
}) => {
    await setup(page);
    const before = await readStore(page, "projectPlans");
    await selectDays(page, [
        "السبت",
        "الأحد",
        "الاثنين",
        "الثلاثاء",
        "الأربعاء",
        "الخميس",
        "الجمعة",
    ]);
    await expect(page.locator(".project-rest-settings")).toContainText(
        "كل الأيام راحة",
    );
    await page.goto(appUrl("/#home"));
    await expect(page.locator(".project-rest-notice")).toContainText(
        "اليوم راحة من المشاريع",
    );
    await expect(page.locator(".daily-project-step")).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "معاينة الاقتراح", exact: true }),
    ).toHaveCount(0);
    expect(await readStore(page, "projectPlans")).toEqual(before);
    await page.goto(appUrl("/#project/p"));
    await expect(
        page.getByLabel("وتيرة المشروع", { exact: true }),
    ).toContainText("لا توجد أيام عمل متبقية");
    await expect(page.locator("main")).not.toContainText("Infinity");
    await expect(page.locator("main")).not.toContainText("NaN");
});
test("الجمعة: المهمة والمتكررة تعملان والإنجاز اليدوي للمشروع يُحفظ دون مطالبة يومية", async ({
    page,
}) => {
    await setup(page);
    await jump(page, "2026-10-02T09:00:00.000Z");
    for (const [title, repeat] of [
        ["موعد الجمعة", "none"],
        ["دورة الجمعة", "daily"],
    ]) {
        await page.goto(appUrl("/#tasks"));
        await openCreate(page, "task");
        const d = page.getByRole("dialog");
        await d.getByLabel("الاسم", { exact: true }).fill(title);
        await d.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-02");
        await d.getByLabel("التكرار", { exact: true }).selectOption(repeat);
        await d
            .getByLabel("الأولوية", { exact: true })
            .selectOption("important-urgent");
        await d.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(d).not.toBeVisible();
    }
    await page.goto(appUrl("/#home"));
    await expect(page.locator(".home-today")).toContainText("موعد الجمعة");
    await expect(page.locator(".home-today")).toContainText("دورة الجمعة");
    await expect(page.locator(".project-rest-notice")).toBeVisible();
    await expect(page.locator(".daily-project-step")).toHaveCount(0);
    await page
        .getByRole("button", { name: "إكمال موعد الجمعة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "إعادة فتح موعد الجمعة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "إكمال دورة الجمعة", exact: true })
        .click();
    const tasks = await readStore(page, "tasks"),
        cycles = await readStore(page, "taskCycles"),
        schedule = await readStore(page, "paceSettings");
    await page.goto(appUrl("/#project/p"));
    await page
        .getByRole("button", { name: "إتمام الخطوة «خطوة 0»", exact: true })
        .click();
    await expect
        .poll(async () => (await readStore(page, "stepWork")).length)
        .toBe(1);
    await expect(
        page.getByLabel("وتيرة المشروع", { exact: true }),
    ).toContainText("إنجاز الراحة الاختياري: 1 خطوة");
    expect(await readStore(page, "tasks")).toEqual(tasks);
    expect(await readStore(page, "taskCycles")).toEqual(cycles);
    expect(await readStore(page, "paceSettings")).toEqual(schedule);
    await jump(page, "2026-10-04T09:00:00.000Z");
    await page.goto(appUrl("/#home"));
    await expect(page.locator(".project-rest-notice")).toHaveCount(0);
    // The compact home owns one action per project. Its resume shortcut
    // replaces the duplicate card action, including after a rest day.
    const next = page.getByRole("button", {
        name: "إتمام الخطوة «خطوة 1»",
        exact: true,
    });
    await expect(next).toBeVisible();
    await expect(next).toHaveCount(1);
    await next.click();
    await expect
        .poll(async () => (await readStore(page, "stepWork")).length)
        .toBe(2);
    expect(
        (await readStore(page, "steps")).find((step) => step.title === "خطوة 1")
            ?.status,
    ).toBe("done");
});
test("النسخ الجديدة والقديمة: تنزيل واستعادة الجدول والدمج دون تبديل إعداد الجهاز", async ({
    page,
}) => {
    await setup(page, 2);
    await selectDays(page, ["الأحد"]);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const backup = JSON.parse(
        fs.readFileSync((await (await download).path())!, "utf8"),
    );
    expect(backup.version).toBe(6);
    expect(backup.paceSettings[0].restHistory.at(-1).days).toEqual([0]);
    await selectDays(page, []);
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "rest.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(await readStore(page, "paceSettings")).toEqual(backup.paceSettings);
    const old = structuredClone(backup);
    delete old.paceSettings[0].restHistory;
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "old-v4.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(old)),
    });
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
        (
            (await readStore(page, "paceSettings"))[0].restHistory as {
                days: number[];
            }[]
        ).at(-1)!.days,
    ).toEqual([5, 6]);
    const localCalendar = (await readStore(page, "paceSettings"))[0]
        .restHistory;
    for (let repeat = 0; repeat < 2; repeat++) {
        await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
            name: "different-rest-calendar.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(backup)),
        });
        await page
            .getByRole("button", { name: "دمج دون استبدال", exact: true })
            .click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        expect(await readStore(page, "projects")).toHaveLength(2);
        expect((await readStore(page, "paceSettings"))[0].restHistory).toEqual(
            localCalendar,
        );
    }
    const merged = (await readStore(page, "projectPlans")).find(
        (p) => p.projectId !== "p",
    );
    expect(merged?.restBefore).toMatchObject({
        history: backup.paceSettings[0].restHistory,
    });
});
for (const width of [320, 390, 768, 1366])
    test(`إعدادات الراحة وRTL والثيمان وإمكانية الوصول بعرض${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        await setup(page, 2);
        await jump(page, "2026-10-02T09:00:00.000Z");
        for (const theme of ["light", "dark"]) {
            await page.goto(appUrl("/#home"));
            if (theme === "dark")
                await page
                    .getByRole("button", { name: "الوضع الداكن", exact: true })
                    .click();
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                theme,
            );
            await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
            await expect(page.locator(".project-rest-notice")).toBeVisible();
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            await settings(page);
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            const axe = await new AxeBuilder({ page })
                .include(".project-rest-settings")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
            expect(axe.violations).toEqual([]);
            fs.mkdirSync("docs/project-rest", { recursive: true });
            await page.screenshot({
                path: `docs/project-rest/settings-${theme}-${width}.png`,
                fullPage: true,
            });
        }
    });
