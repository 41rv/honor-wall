import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readStore, importData, sizedFixture } from "./helpers";
import { readFileSync } from "node:fs";
test.use({ timezoneId: "Asia/Riyadh" });
async function time(page: Page, at: string) {
    await page.clock.setSystemTime(new Date(at));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
async function begin(page: Page, title: string) {
    await page.goto("/#tasks");
    await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("الاسم", { exact: true }).fill(title);
    await form.getByLabel("الملاحظات", { exact: false }).fill("ملاحظات محفوظة");
    return form;
}
async function save(page: Page) {
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function showTask(page: Page, title: string) {
    await page
        .getByRole("button", { name: "تفاصيل " + title, exact: true })
        .click();
}
async function options(page: Page) {
    await page.getByRole("button", { name: "تعديل الموعد والأولوية" }).click();
    return page.getByRole("dialog");
}
async function settings(page: Page) {
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "حفظ الإعدادات" })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-16T09:00:00Z") });
});
test("إنشاء عامة وإتمام وتراجع وتعديل وحذف دون موعد أو أولوية", async ({
    page,
}) => {
    await begin(page, "عامة");
    await save(page);
    let tasks = await readStore(page, "tasks");
    expect(tasks[0].schedule).toBeUndefined();
    expect(tasks[0].priority).toBeUndefined();
    await expect(page.locator(".priority-strip")).toHaveCount(0);
    await expect(page.locator(".task-due")).toContainText("بدون موعد");
    await page.getByRole("button", { name: "إكمال عامة", exact: true }).click();
    await page
        .getByRole("button", { name: "إعادة فتح عامة", exact: true })
        .click();
    await showTask(page, "عامة");
    await page.getByLabel("تعديل الاسم").fill("عامة معدلة");
    await page.getByLabel("ملاحظات العنصر").fill("ملاحظات معدلة");
    await page.getByLabel("ملاحظات العنصر").blur();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await expect
        .poll(async () => (await readStore(page, "tasks")).length)
        .toBe(0);
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    tasks = await readStore(page, "tasks");
    expect(tasks[0].notes).toBe("ملاحظات معدلة");
    expect(tasks[0].title).toBe("عامة معدلة");
});
test("تاريخ فقط ثم وقت وتغيير وإلغاء الموعد مع حفظ المعرف والملاحظات", async ({
    page,
}) => {
    const f = await begin(page, "موعد");
    await f.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-19");
    await f.getByLabel("إظهار «اقترب الموعد»").selectOption("3");
    await save(page);
    await expect(page.locator(".task-due")).toContainText("اقترب الموعد");
    const old = (await readStore(page, "tasks"))[0];
    await showTask(page, "موعد");
    let edit = await options(page);
    await edit.getByLabel("الوقت", { exact: false }).fill("17:00");
    await settings(page);
    expect(
        ((await readStore(page, "tasks"))[0].schedule as { time: string }).time,
    ).toBe("17:00");
    await time(page, "2026-10-19T14:01:00Z");
    await expect(page.locator(".task-details .task-due")).toContainText(
        "متأخرة",
    );
    edit = await options(page);
    await edit.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-22");
    await settings(page);
    await expect(page.locator(".task-details .task-due")).not.toContainText(
        "متأخرة",
    );
    edit = await options(page);
    await edit.getByRole("button", { name: "إلغاء الموعد والتكرار" }).click();
    await settings(page);
    const latest = (await readStore(page, "tasks"))[0];
    expect(latest.id).toBe(old.id);
    expect(latest.notes).toBe(old.notes);
    expect(latest.schedule).toBeUndefined();
    await expect(page.locator(".task-details .task-due")).toContainText(
        "بدون موعد",
    );
});
for (const [lead, at, state] of [
    [0, "2026-10-19T09:00:00Z", "future"],
    [1, "2026-10-19T09:00:00Z", "near"],
    [3, "2026-10-17T09:00:00Z", "near"],
    [7, "2026-10-13T09:00:00Z", "near"],
] as const) {
    test(`فترة الاقتراب ${lead} أيام وحالة اليوم والتأخر بعد منتصف الليل`, async ({
        page,
    }) => {
        await time(page, at);
        const f = await begin(page, "قريبة");
        await f.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-20");
        await f.getByLabel("إظهار «اقترب الموعد»").selectOption(String(lead));
        await save(page);
        await expect(page.locator(".task-due")).toHaveClass(
            new RegExp("due-" + state),
        );
        await time(page, "2026-10-20T09:00:00Z");
        await expect(page.locator(".task-due")).toHaveClass(/due-today/);
        await time(page, "2026-10-20T21:00:00Z");
        await expect(page.locator(".task-due")).toContainText("متأخرة");
    });
}
for (const completeAt of [
    "2026-10-17T09:00:00Z",
    "2026-10-18T09:00:00Z",
    "2026-10-23T09:00:00Z",
]) {
    test(`مهمة السبت تنجز طبيعيًا عند ${completeAt} وتعود دورة جديدة السبت التالي`, async ({
        page,
    }) => {
        const f = await begin(page, "كل سبت");
        await f.getByLabel("التكرار", { exact: true }).selectOption("weekly");
        await f
            .getByRole("checkbox", { name: "الجمعة", exact: true })
            .uncheck();
        await f.getByRole("checkbox", { name: "السبت", exact: true }).check();
        await save(page);
        await time(page, completeAt);
        const check = page.getByRole("button", {
            name: "إكمال كل سبت",
            exact: true,
        });
        await check.click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "taskCycles")).filter(
                        (c) => c.status === "completed",
                    ).length,
            )
            .toBe(1);
        expect((await readStore(page, "tasks"))[0].status).toBe("todo");
        await expect(
            page.locator(".task-due").filter({ hasText: "متأخرة" }),
        ).toHaveCount(0);
        await time(page, "2026-10-23T21:00:00Z");
        await expect(
            page.getByRole("button", { name: "إكمال كل سبت", exact: true }),
        ).toBeVisible();
        expect(
            (await readStore(page, "taskCycles")).filter(
                (c) => c.status === "completed",
            ),
        ).toHaveLength(1);
    });
}
test("أسبوعية بعدة أيام ووقت: فوت الدورة لا يكرر المهمة والسجل محفوظ", async ({
    page,
}) => {
    const f = await begin(page, "سبت وثلاثاء");
    await f.getByLabel("التكرار", { exact: true }).selectOption("weekly");
    await f.getByRole("checkbox", { name: "الجمعة", exact: true }).uncheck();
    await f.getByRole("checkbox", { name: "السبت", exact: true }).check();
    await f.getByRole("checkbox", { name: "الثلاثاء", exact: true }).check();
    await f.getByLabel("الوقت", { exact: false }).fill("20:00");
    await save(page);
    await time(page, "2026-10-20T17:00:00Z");
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.status === "incomplete",
                ).length,
        )
        .toBe(1);
    expect(await readStore(page, "tasks")).toHaveLength(1);
    await expect(page.locator(".task-row")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".task-row")).toHaveCount(1);
    await showTask(page, "سبت وثلاثاء");
    await page.locator(".cycle-history summary").click();
    await expect(page.locator(".cycle-history")).toContainText("غير مكتملة");
});
test("يومية: إتمام قبل نهاية اليوم، تراجع سريع، دورة فائتة، ومراجعة السجل", async ({
    page,
}) => {
    const f = await begin(page, "يومية");
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await f.getByLabel("الوقت", { exact: false }).fill("20:00");
    await save(page);
    await time(page, "2026-10-16T20:59:00Z");
    await page
        .getByRole("button", { name: "إكمال يومية", exact: true })
        .evaluate((el) => {
            for (let i = 0; i < 10; i++) (el as HTMLButtonElement).click();
        });
    await expect
        .poll(async () => (await readStore(page, "taskCycles"))[0].status)
        .toBe("current");
    await page
        .getByRole("button", { name: "إكمال يومية", exact: true })
        .click();
    await page.clock.runFor(60000);
    await expect(
        page.getByRole("button", { name: "إكمال يومية", exact: true }),
    ).toBeVisible();
    await time(page, "2026-10-17T21:00:00Z");
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.status === "incomplete",
                ).length,
        )
        .toBe(1);
    expect(
        (await readStore(page, "taskCycles")).filter(
            (c) => c.status === "completed",
        ),
    ).toHaveLength(1);
    await page.goto("/#home");
    await expect(
        page.locator('[aria-label="مهامك الآن"] .task-row'),
    ).toHaveCount(1);
});
test("شهرية ٣١ تعبر السنة وفبراير وتغيير التكرار يحفظ التاريخ", async ({
    page,
}) => {
    await time(page, "2027-12-01T09:00:00Z");
    const f = await begin(page, "آخر الشهر");
    await f.getByLabel("التكرار", { exact: true }).selectOption("monthly");
    await f.getByLabel("يوم الشهر", { exact: true }).selectOption("31");
    await expect(f).toContainText("آخر يوم من الشهر");
    await save(page);
    await time(page, "2028-01-01T09:00:00Z");
    await page
        .getByRole("button", { name: "إكمال آخر الشهر", exact: true })
        .click();
    await time(page, "2028-03-01T09:00:00Z");
    await expect
        .poll(async () => (await readStore(page, "taskCycles")).length)
        .toBe(3);
    await showTask(page, "آخر الشهر");
    const history = await readStore(page, "taskCycles");
    const edit = await options(page);
    await edit.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await settings(page);
    await expect
        .poll(async () => (await readStore(page, "taskCycles")).length)
        .toBe(4);
    for (const c of history.filter(
        (c) => Date.parse(c.end as string) < Date.parse("2028-03-01T09:00:00Z"),
    ))
        expect(
            (await readStore(page, "taskCycles")).find((x) => x.id === c.id),
        ).toEqual(c);
    const general = await options(page);
    await general
        .getByRole("button", { name: "إلغاء الموعد والتكرار" })
        .click();
    await settings(page);
    expect((await readStore(page, "tasks"))[0].schedule).toBeUndefined();
    await expect(page.locator(".task-details .task-due")).toContainText(
        "بدون موعد",
    );
});
test("الأولويات الأربعة بألوانها ثم الإزالة، مع الاسم في التفاصيل فقط", async ({
    page,
}) => {
    await begin(page, "أولوية");
    await save(page);
    const id = (await readStore(page, "tasks"))[0].id;
    for (const [key, rgb, name] of [
        ["important-urgent", "rgb(220, 87, 87)", "هام وعاجل"],
        ["important", "rgb(57, 136, 215)", "هام وغير عاجل"],
        ["urgent", "rgb(230, 163, 61)", "عاجل وغير هام"],
        ["low", "rgb(139, 146, 157)", "غير هام وغير عاجل"],
    ]) {
        await page.goto("/#task/" + id);
        const f = await options(page);
        await f.getByLabel("الأولوية", { exact: true }).selectOption(key);
        await settings(page);
        await expect(page.locator(".task-details")).toContainText(name);
        await page.goto("/#tasks");
        expect(
            await page
                .locator(".priority-strip")
                .evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe(rgb);
        await expect(page.locator(".task-row")).not.toContainText(name);
    }
    await showTask(page, "أولوية");
    const f = await options(page);
    await f.getByLabel("الأولوية", { exact: true }).selectOption("");
    await settings(page);
    await page.goto("/#tasks");
    await expect(page.locator(".priority-strip")).toHaveCount(0);
});
test("نسخة جديدة تحفظ الدورات والأولوية، واستيراد مشروع مستقل لا يؤثر عليها", async ({
    page,
}) => {
    await importData(page, sizedFixture(2));
    const f = await begin(page, "يومية للنسخ");
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await f.getByLabel("الأولوية", { exact: true }).selectOption("important");
    await save(page);
    await page
        .getByRole("button", { name: "إكمال يومية للنسخ", exact: true })
        .click();
    await page.goto("/#backup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const file = await download;
    const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
    expect(data.version).toBe(2);
    expect(data.taskCycles).toHaveLength(1);
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await page.getByRole("button", { name: "تأكيد استبدال البيانات" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto("/#projects");
    await page.getByLabel("استيراد مشروع", { exact: true }).setInputFiles({
        name: "project.json",
        mimeType: "application/json",
        buffer: readFileSync(
            new URL("../../examples/project-import.json", import.meta.url),
        ),
    });
    await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
    await expect(page).toHaveURL(/#project\//);
    expect(await readStore(page, "taskCycles")).toEqual(data.taskCycles);
    expect(
        (await readStore(page, "tasks")).find((t) => t.title === "يومية للنسخ")
            ?.priority,
    ).toBe("important");
    expect(
        (await readStore(page, "projects")).find((p) => p.id === "p"),
    ).toEqual(data.projects[0]);
});
for (const width of [390, 1366]) {
    test(`النموذج والتصنيف وRTL والثيمات الأربعة بعرض ${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 850 });
        await page.goto("/#tasks");
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
                const f = await begin(page, "تصميم");
                await f
                    .getByLabel("التكرار", { exact: true })
                    .selectOption("weekly");
                expect(
                    (await new AxeBuilder({ page }).include("dialog").analyze())
                        .violations,
                ).toEqual([]);
                expect(
                    await f.evaluate((el) => el.scrollWidth <= el.clientWidth),
                ).toBe(true);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                if (identity === "green" && mode === "light")
                    await page.screenshot({
                        path: `docs/tasks/task-form-${width}.png`,
                    });
                const priority =
                    identity === "green"
                        ? mode === "light"
                            ? "important-urgent"
                            : "important"
                        : mode === "light"
                          ? "urgent"
                          : "low";
                const colors = {
                    "important-urgent": "rgb(220, 87, 87)",
                    important: "rgb(57, 136, 215)",
                    urgent: "rgb(230, 163, 61)",
                    low: "rgb(139, 146, 157)",
                };
                await f
                    .getByLabel("الأولوية", { exact: true })
                    .selectOption(priority);
                await save(page);
                const saved = (await readStore(page, "tasks")).find(
                    (t) => t.priority === priority,
                )!;
                const row = page.locator(`[data-task-id="${saved.id}"]`);
                expect(
                    await row
                        .locator(".priority-strip")
                        .evaluate((el) => getComputedStyle(el).backgroundColor),
                ).toBe(colors[priority]);
                expect(
                    (
                        await new AxeBuilder({ page })
                            .include(".task-list")
                            .analyze()
                    ).violations,
                ).toEqual([]);
                await page.screenshot({
                    path: `docs/tasks/priority-${width}-${identity}-${mode}.png`,
                });
            }
    });
}
test("تحويل عامة إلى متكررة ثم عامة يحفظ المعرف والملاحظات وسجل الإنجاز", async ({
    page,
}) => {
    await begin(page, "تحويل");
    await save(page);
    const original = (await readStore(page, "tasks"))[0];
    await showTask(page, "تحويل");
    const f = await options(page);
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await settings(page);
    await page
        .getByRole("button", { name: "إتمام المهمة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.status === "completed",
                ).length,
        )
        .toBe(1);
    const edit = await options(page);
    await edit.getByRole("button", { name: "إلغاء الموعد والتكرار" }).click();
    await settings(page);
    const latest = (await readStore(page, "tasks"))[0];
    expect(latest.id).toBe(original.id);
    expect(latest.notes).toBe(original.notes);
    expect(latest.schedule).toBeUndefined();
    expect(
        (await readStore(page, "taskCycles")).filter(
            (c) => c.status === "completed",
        ),
    ).toHaveLength(1);
});
test("الرئيسية والقوائم تميز العامة والقريبة واليوم والمتأخرة والمتكررة والقادمة", async ({
    page,
}) => {
    for (const [title, date] of [
        ["عامة", ""],
        ["اليوم", "2026-10-16"],
        ["متأخرة", "2026-10-15"],
        ["قريبة", "2026-10-17"],
        ["بعيدة", "2026-10-30"],
        ["متكررة", ""],
    ]) {
        const f = await begin(page, title);
        if (date)
            await f.getByLabel("تاريخ التنفيذ", { exact: true }).fill(date);
        if (title === "متكررة")
            await f
                .getByLabel("التكرار", { exact: true })
                .selectOption("daily");
        await save(page);
    }
    for (const [filter, title] of [
        ["بدون موعد", "عامة"],
        ["اليوم", "اليوم"],
        ["اقترب الموعد", "قريبة"],
        ["متأخرة", "متأخرة"],
        ["متكررة", "متكررة"],
        ["قادمة", "بعيدة"],
    ]) {
        await page
            .getByRole("group", { name: "عرض المهام بحسب موعدها" })
            .getByRole("button", { name: filter, exact: true })
            .click();
        await expect(page.locator(".task-row")).toHaveCount(1);
        await expect(page.locator(".task-row")).toContainText(title);
    }
    await page.goto("/#home");
    await expect(
        page.locator('[aria-label="مهامك الآن"] .task-row'),
    ).toHaveCount(5);
    await expect(page.locator(".task-overview")).toContainText("قادمة: 1");
    await expect(
        page.locator('[aria-label="مهامك الآن"] .task-row').first(),
    ).toContainText("متأخرة");
});
test("إعداد أسبوعي بلا أيام يُرفض ولا يضيف مهمة ناقصة", async ({ page }) => {
    const f = await begin(page, "غير صالحة");
    await f.getByLabel("التكرار", { exact: true }).selectOption("weekly");
    await f.getByRole("checkbox", { name: "الجمعة", exact: true }).uncheck();
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f.getByRole("alert")).toContainText("يومًا أسبوعيًا");
    expect(await readStore(page, "tasks")).toHaveLength(0);
});
test.describe("توقيت نيويورك", () => {
    test.use({ timezoneId: "America/New_York" });
    test("تاريخ محلي مختلف عن UTC ودورة ٢٥ ساعة دون نسخ بسبب تكرار الساعة", async ({
        page,
    }) => {
        await time(page, "2026-11-01T03:00:00Z");
        const f = await begin(page, "توقيت محلي");
        await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
        await expect(
            f.getByLabel("تاريخ بداية التكرار", { exact: true }),
        ).toHaveValue("2026-10-31");
        await save(page);
        expect(
            (
                (await readStore(page, "tasks"))[0].schedule as {
                    timeZone: string;
                }
            ).timeZone,
        ).toBe("America/New_York");
        await time(page, "2026-11-01T05:59:59Z");
        await expect
            .poll(async () => (await readStore(page, "taskCycles")).length)
            .toBe(2);
        const cycles = await readStore(page, "taskCycles");
        const current = cycles.find((c) => c.status === "current")!;
        expect(
            Date.parse(current.end as string) -
                Date.parse(current.start as string),
        ).toBe(25 * 3600000);
        await time(page, "2026-11-01T06:00:00Z");
        expect(await readStore(page, "taskCycles")).toHaveLength(2);
        await page
            .getByRole("button", { name: "إكمال توقيت محلي", exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "taskCycles")).find(
                        (c) => c.id === current.id,
                    )?.status,
            )
            .toBe("completed");
    });
});
test("أزرار الحالة وعلامة الإنجاز تتشارك آخر طلب للدورة وتحفظ تاريخ البدء", async ({
    page,
}) => {
    const f = await begin(page, "حالات الدورة");
    await f.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await save(page);
    await showTask(page, "حالات الدورة");
    await page.getByRole("button", { name: "جارٍ العمل", exact: true }).click();
    await expect
        .poll(async () => (await readStore(page, "taskCycles"))[0].workStatus)
        .toBe("doing");
    await expect(
        page
            .locator("dt")
            .filter({ hasText: "بدء العمل" })
            .locator("..")
            .locator("dd"),
    ).not.toHaveText("—");
    await page
        .getByRole("button", { name: "إتمام المهمة", exact: true })
        .click();
    await page.getByRole("button", { name: "لم تبدأ", exact: true }).click();
    await expect
        .poll(async () => (await readStore(page, "taskCycles"))[0].status)
        .toBe("current");
    await expect(
        page.getByRole("button", { name: "إتمام المهمة", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.locator(".status-controls").evaluate((el) => {
        (el.querySelectorAll("button")[1] as HTMLButtonElement).click();
        (el.querySelectorAll("button")[0] as HTMLButtonElement).click();
    });
    await expect
        .poll(async () => (await readStore(page, "taskCycles"))[0].workStatus)
        .toBe("todo");
    expect((await readStore(page, "tasks"))[0].status).toBe("todo");
});
