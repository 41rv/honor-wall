import { test, expect, type Page } from "@playwright/test";
import { readStore } from "./helpers";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
test.use({ timezoneId: "Asia/Riyadh" });
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-18T09:00:00Z") });
});
async function add(
    page: Page,
    title: string,
    scheduled = false,
    priority = "",
) {
    await page.goto("/#tasks");
    await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("الاسم", { exact: true }).fill(title);
    if (priority)
        await form
            .getByLabel("الأولوية", { exact: true })
            .selectOption(priority);
    if (scheduled)
        await form
            .getByLabel("تاريخ التنفيذ", { exact: true })
            .fill("2026-10-18");
    await form.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(form).not.toBeVisible();
}
test("مهامي اليوم: الاختيار والإزالة والإنجاز والتراجع وعبور اليوم دون فقد", async ({
    page,
}) => {
    await add(page, "عامة لليوم");
    await add(page, "موعد اليوم", true);
    await page.goto("/#today");
    await expect(
        page.getByRole("region", { name: "مستحقة اليوم" }),
    ).toContainText("موعد اليوم");
    await page.getByText("اختيار مهام عامة لليوم", { exact: true }).click();
    await page
        .getByRole("button", {
            name: "إضافة «عامة لليوم» إلى اليوم",
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole("region", { name: "اخترتها لليوم" })
            .locator(".task-row"),
    ).toHaveCount(1);
    await page
        .getByRole("button", { name: "إكمال عامة لليوم", exact: true })
        .click();
    await page
        .getByRole("button", { name: "إعادة فتح عامة لليوم", exact: true })
        .click();
    await page
        .getByRole("button", {
            name: "إزالة «عامة لليوم» من اليوم",
            exact: true,
        })
        .click();
    await page
        .getByRole("button", {
            name: "إضافة «عامة لليوم» إلى اليوم",
            exact: true,
        })
        .click();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "إكمال عامة لليوم", exact: true }),
    ).toBeVisible();
    await page.clock.setSystemTime(new Date("2026-10-18T21:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
        page
            .getByRole("region", { name: "اخترتها لليوم" })
            .locator(".task-row"),
    ).toHaveCount(0);
    const task = (await readStore(page, "tasks")).find(
        (t) => t.title === "عامة لليوم",
    )!;
    expect(task.status).toBe("todo");
    expect(task.schedule).toBeUndefined();
    await page.goto("/#tasks");
    await expect(
        page.getByRole("button", { name: "إكمال عامة لليوم", exact: true }),
    ).toBeVisible();
});

test("التقويم: سبعة أيام وتنقل وعودة وإنجاز وتراجع وتعديل دون إنشاء المستقبل", async ({
    page,
}) => {
    await add(page, "موعد للتقويم", true);
    await page.goto("/#calendar");
    await expect(page.locator(".calendar-day")).toHaveCount(7);
    const day = page.getByRole("region", { name: "2026-10-18", exact: true });
    await day
        .getByRole("button", {
            name: "إتمام المهمة «موعد للتقويم»",
            exact: true,
        })
        .click();
    await day
        .getByRole("button", {
            name: "إعادة فتح المهمة «موعد للتقويم»",
            exact: true,
        })
        .click();
    await day.getByRole("link", { name: "موعد للتقويم", exact: true }).click();
    await page
        .getByRole("button", { name: "تعديل الموعد والأولوية", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByLabel("تاريخ التنفيذ", { exact: true })
        .fill("2026-10-25");
    await page
        .getByRole("button", { name: "حفظ الإعدادات", exact: true })
        .click();
    await page.goto("/#calendar");
    await expect(
        page.getByRole("link", { name: "موعد للتقويم", exact: true }),
    ).toHaveCount(0);
    await page
        .getByRole("button", { name: "الأسبوع القادم", exact: true })
        .click();
    await expect(
        page.getByRole("region", { name: "2026-10-25", exact: true }),
    ).toContainText("موعد للتقويم");
    await page
        .getByRole("button", { name: "الأسبوع السابق", exact: true })
        .click();
    await page
        .getByRole("button", { name: "الأسبوع الحالي", exact: true })
        .click();
    await expect(page.locator('.calendar-day[data-today="true"]')).toHaveCount(
        1,
    );
    expect(await readStore(page, "taskCycles")).toHaveLength(0);
});

test("مواعيد التكرار المستقبلية غير قابلة للإنجاز ولا تحفظ كدورات عند التنقل", async ({
    page,
}) => {
    await page.goto("/#tasks");
    await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
    const f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill("يومية التقويم");
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    const before = await readStore(page, "taskCycles");
    await page.goto("/#calendar");
    await page
        .getByRole("button", { name: "الأسبوع القادم", exact: true })
        .click();
    await expect(page.locator(".calendar-entry")).toHaveCount(7);
    for (const button of await page
        .locator(".calendar-entry .task-check")
        .all())
        await expect(button).toBeDisabled();
    expect(await readStore(page, "taskCycles")).toEqual(before);
    await page
        .getByRole("button", { name: "الأسبوع الحالي", exact: true })
        .click();
    const today = page.getByRole("region", { name: "2026-10-18", exact: true });
    await today
        .getByRole("button", {
            name: "إتمام المهمة «يومية التقويم»",
            exact: true,
        })
        .click();
    await expect(
        today.getByRole("button", {
            name: "إعادة فتح المهمة «يومية التقويم»",
            exact: true,
        }),
    ).toBeEnabled();
    expect((await readStore(page, "tasks"))[0].status).toBe("todo");
});

test("الداشبورد يبدل الفترات ويحدث الإنجاز بعد التراجع ويعرض نقص البيانات", async ({
    page,
}) => {
    await add(page, "إنجاز عام");
    await page
        .getByRole("button", { name: "إكمال إنجاز عام", exact: true })
        .click();
    await page.goto("/#progress");
    const dashboard = page.getByRole("region", {
        name: "إحصائيات الفترة",
        exact: true,
    });
    await expect(
        dashboard
            .locator(".period-metric")
            .filter({ hasText: "المهام المنجزة" })
            .locator("strong"),
    ).toHaveText("1");
    await expect(
        dashboard
            .locator(".period-metric")
            .filter({ hasText: "إنجاز المهام المستحقة" })
            .locator("strong"),
    ).toHaveText("—");
    await expect(dashboard).toContainText("الفترة الحالية جزئية");
    await expect(dashboard).toContainText("لا تتوفر بيانات كافية");
    for (const label of ["شهري", "سنوي", "أسبوعي"]) {
        await dashboard
            .getByRole("button", { name: label, exact: true })
            .click();
        await expect(
            dashboard.getByRole("button", { name: label, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
    }
    await page.goto("/#tasks");
    if ((await page.locator(".completed-list").getAttribute("open")) === null)
        await page
            .locator("summary")
            .filter({ hasText: "المهام المنجزة" })
            .click();
    await page
        .getByRole("button", { name: "إعادة فتح إنجاز عام", exact: true })
        .click();
    await page.goto("/#progress");
    await expect(
        dashboard
            .locator(".period-metric")
            .filter({ hasText: "المهام المنجزة" })
            .locator("strong"),
    ).toHaveText("0");
});

test("رؤى مشروع جديد: بلوغ ٥٠٪ بعد ١٢ ساعة وسجل وتراجع ونسخة كاملة v3", async ({
    page,
}) => {
    await page.goto("/#projects");
    await page.getByRole("button", { name: "مشروع جديد", exact: true }).click();
    let form = page.getByRole("dialog");
    await form.getByLabel("الاسم", { exact: true }).fill("مشروع الرؤى");
    await form.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(form).not.toBeVisible();
    const p = (await readStore(page, "projects"))[0];
    await page.goto("/#project/" + p.id);
    for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: "خطوة", exact: true }).click();
        form = page.getByRole("dialog");
        await form.getByLabel("الاسم", { exact: true }).fill("عمل " + i);
        await form.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(form).not.toBeVisible();
    }
    await page.clock.setSystemTime(
        new Date(Date.parse(p.createdAt as string) + 12 * 3600000),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    for (const i of [0, 1])
        await page
            .getByRole("button", {
                name: `إتمام الخطوة «عمل ${i}»`,
                exact: true,
            })
            .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "projectProgress")).filter(
                    (r) => r.reason === "completion",
                ).length,
        )
        .toBe(2);
    await page.goto("/#progress");
    const insights = page.getByRole("region", {
        name: "رؤى مسار",
        exact: true,
    });
    await expect(
        insights
            .locator(".insight-milestones > div")
            .filter({ has: page.getByText("50٪", { exact: true }) }),
    ).toContainText("12 ساعة");
    await expect(
        insights.getByRole("img", {
            name: "تغير نسبة إنجاز مشروع الرؤى عبر الزمن",
            exact: true,
        }),
    ).toBeVisible();
    await expect(insights.locator("svg path")).toHaveCSS(
        "stroke",
        "rgb(24, 92, 75)",
    );
    await page.screenshot({
        path: "docs/planning/screenshots/project-insights.png",
        fullPage: true,
    });
    await insights
        .locator("summary")
        .filter({ hasText: "سجل تغير نسب المشروع" })
        .click();
    await expect(insights.locator("tbody tr")).toHaveCount(3);
    await page.reload();
    expect(await readStore(page, "projectProgress")).toHaveLength(3);
    await page.goto("/#backup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const backup = JSON.parse(
        readFileSync((await (await download).path())!, "utf8"),
    );
    expect(backup.version).toBe(3);
    expect(backup.projectProgress).toHaveLength(3);
    expect(backup.projectTracking).toHaveLength(1);
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "v3.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(await readStore(page, "projectProgress")).toEqual(
        backup.projectProgress,
    );
    expect(await readStore(page, "projectTracking")).toEqual(
        backup.projectTracking,
    );
    await page.goto("/#projects");
    await page.getByLabel("استيراد مشروع", { exact: true }).setInputFiles({
        name: "project.json",
        mimeType: "application/json",
        buffer: readFileSync(
            new URL("../../examples/project-import.json", import.meta.url),
        ),
    });
    await page
        .getByRole("button", { name: "تأكيد استيراد المشروع", exact: true })
        .click();
    await expect(page).toHaveURL(/#project\//);
    expect(await readStore(page, "projectProgress")).toEqual(
        backup.projectProgress,
    );
    expect(
        (await readStore(page, "projectTracking")).find(
            (t) => t.projectId === p.id,
        ),
    ).toEqual(backup.projectTracking[0]);
    expect(
        (await readStore(page, "projectTracking")).filter(
            (t) => t.origin === "new",
        ),
    ).toHaveLength(2);
    await page.goto("/#project/" + p.id);
    await page
        .getByRole("button", { name: "إعادة فتح الخطوة «عمل 1»", exact: true })
        .click();
    await page.goto("/#progress");
    await expect(insights).toContainText("نقطة مئوية");
    await expect
        .poll(async () => (await readStore(page, "projectProgress")).length)
        .toBe(4);
    expect(
        (await readStore(page, "projectProgress")).find((r) => r.order === 4)
            ?.after,
    ).toBe(25);
});

for (const width of [390, 1366])
    test(`التنظيم والتقويم والرؤى: RTL والثيمات الأربعة بعرض ${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        await add(page, "مهمة تصميم", true, "important");
        for (const identity of ["green", "mono"])
            for (const mode of ["light", "dark"]) {
                await page.evaluate(
                    ({ identity, mode }) => {
                        localStorage.setItem("masar-identity", identity);
                        localStorage.setItem("masar-theme", mode);
                    },
                    { identity, mode },
                );
                await page.reload();
                for (const route of ["today", "calendar", "progress"]) {
                    await page.goto("/#" + route);
                    await expect(page.locator("html")).toHaveAttribute(
                        "dir",
                        "rtl",
                    );
                    expect(
                        await page.evaluate(
                            () =>
                                document.documentElement.scrollWidth <=
                                innerWidth,
                        ),
                    ).toBe(true);
                    if (route !== "progress")
                        await expect(
                            page.locator(".priority-strip").first(),
                        ).toHaveCSS("background-color", "rgb(57, 136, 215)");
                    expect(
                        (
                            await new AxeBuilder({ page })
                                .include("main")
                                .analyze()
                        ).violations,
                    ).toEqual([]);
                    if (identity === "green" && mode === "light")
                        await page.screenshot({
                            path: `docs/planning/screenshots/${route}-${width}.png`,
                            fullPage: true,
                        });
                }
            }
    });

test("دورة السبت المفتوحة تظهر الأحد في قسم متاح وتنجز دون تأخير", async ({
    page,
}) => {
    await page.clock.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    await page.goto("/#tasks");
    await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
    const f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill("سبت مرن");
    await f.getByLabel("التكرار", { exact: true }).selectOption("weekly");
    await f.getByRole("checkbox", { name: "الجمعة", exact: true }).uncheck();
    await f.getByRole("checkbox", { name: "السبت", exact: true }).check();
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    await page.clock.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.goto("/#today");
    const available = page.getByRole("region", {
        name: "دورات سابقة ما زالت متاحة",
        exact: true,
    });
    await expect(available.locator(".task-row")).toHaveCount(1);
    await expect(
        page
            .getByRole("region", { name: "مهام تجاوزت موعدها", exact: true })
            .locator(".task-row"),
    ).toHaveCount(0);
    await available
        .getByRole("button", { name: "إكمال سبت مرن", exact: true })
        .click();
    await expect(
        available.getByRole("button", {
            name: "إعادة فتح سبت مرن",
            exact: true,
        }),
    ).toBeVisible();
    await expect
        .poll(async () => (await readStore(page, "taskCycles"))[0]?.status)
        .toBe("completed");
    expect((await readStore(page, "tasks"))[0].status).toBe("todo");
});

test("موعد الساعة المنقضي اليوم يُفصل عن المستحقة ويتيح الإنجاز والتراجع", async ({
    page,
}) => {
    await add(page, "تجاوز الساعة", true);
    await page
        .getByRole("button", { name: "تفاصيل تجاوز الساعة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تعديل الموعد والأولوية", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByLabel("الوقت", { exact: false })
        .fill("10:00");
    await page
        .getByRole("button", { name: "حفظ الإعدادات", exact: true })
        .click();
    await page.goto("/#today");
    const overdue = page.getByRole("region", {
        name: "مهام تجاوزت موعدها",
        exact: true,
    });
    await expect(overdue.locator(".task-row")).toHaveCount(1);
    await expect(
        page
            .getByRole("region", { name: "مستحقة اليوم", exact: true })
            .locator(".task-row"),
    ).toHaveCount(0);
    await overdue
        .getByRole("button", { name: "إكمال تجاوز الساعة", exact: true })
        .click();
    await overdue
        .getByRole("button", { name: "إعادة فتح تجاوز الساعة", exact: true })
        .click();
    await expect(overdue).toContainText("متأخرة");
});

test("إحصاء إتمام المشروع يتحدث داخل الداشبورد دون انتظار نبضة الدقيقة", async ({
    page,
}) => {
    await page.goto("/#projects");
    await page.getByRole("button", { name: "مشروع جديد", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("الاسم", { exact: true }).fill("إتمام الآن");
    await form.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.goto("/#progress");
    const metric = page
        .locator(".period-metric")
        .filter({ hasText: "مشاريع اكتملت في الفترة" })
        .locator("strong");
    await expect(metric).toHaveText("0");
    await page.clock.runFor(2000);
    await page
        .getByRole("button", {
            name: "إتمام المشروع «إتمام الآن»",
            exact: true,
        })
        .click();
    await expect(metric).toHaveText("1");
});
