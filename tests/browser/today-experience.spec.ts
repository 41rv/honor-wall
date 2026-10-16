import { test, expect, type Page } from "@playwright/test";
import {
    importData,
    sizedFixture,
    readStore,
    chooseTaskToday,
} from "./helpers";
import type { Task } from "../../app/model";
import fs from "node:fs";
const day = "2026-10-17";
const now = day + "T09:00:00.000Z";
const zone = "Asia/Riyadh";
test.use({ timezoneId: zone });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(now) });
    const messages: string[] = [];
    errors.set(page, messages);
    page.on("pageerror", (e) => messages.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") messages.push(m.text());
    });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
function task(id: string, priority?: Task["priority"]): Task {
    return {
        id,
        title: id,
        notes: "ملاحظات أصلية",
        status: "todo",
        createdAt: now,
        updatedAt: now,
        priority,
        today: { date: day, timeZone: zone },
    };
}
const schedule = (
    repeat: "none" | "daily" | "weekly" | "monthly",
    date = day,
) => ({
    date,
    timeZone: zone,
    repeat,
    leadDays: 1 as const,
    ...(repeat === "weekly" ? { weekdays: [6] } : {}),
    ...(repeat === "monthly" ? { monthDay: 17 } : {}),
});
async function setup(page: Page, tasks: Task[]) {
    const data = sizedFixture(4);
    data.version = 2;
    data.taskCycles = [];
    data.tasks = tasks.map((task) =>
        task.schedule
            ? {
                  ...task,
                  today: undefined,
                  scheduleRevision: 1,
                  scheduleSince: now,
              }
            : task,
    );
    await importData(page, data);
    await page.goto("/#today");
}
async function jump(page: Page, time: string) {
    await page.clock.setSystemTime(new Date(time));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
const names = (page: Page) => page.locator(".home-today .task-main strong");
test("القائمة الأصلية للإجراءات تعرض الإضافة والإزالة وتحافظ على خصائص المهمة", async ({
    page,
}) => {
    const ordinary = task("عادية", "important");
    delete ordinary.today;
    const scheduled = {
        ...task("مجدولة"),
        today: undefined,
        schedule: schedule("none"),
    };
    await setup(page, [ordinary, scheduled]);
    await page.goto("/#tasks");
    const before = await readStore(page, "tasks");
    await page
        .getByRole("button", { name: "إجراءات المهمة «عادية»", exact: true })
        .click();
    const d = page.getByRole("dialog");
    await expect(
        d.getByRole("button", { name: "تعديل الاسم والملاحظات", exact: true }),
    ).toBeVisible();
    await expect(
        d.getByRole("button", { name: "حذف", exact: true }),
    ).toBeVisible();
    await d
        .getByRole("button", { name: "إضافة إلى مهامي اليوم", exact: true })
        .click();
    await expect(d).not.toBeVisible();
    const after = await readStore(page, "tasks");
    expect(after.find((t) => t.id === "عادية")).toEqual({
        ...before.find((t) => t.id === "عادية"),
        today: { date: day, timeZone: zone },
    });
    await page.goto("/#today");
    await expect(names(page)).toHaveText(["عادية", "مجدولة"]);
    await expect(page.locator(".daily-picker,.daily-remove")).toHaveCount(0);
    await chooseTaskToday(page, "عادية", false);
    await expect(names(page)).toHaveText(["مجدولة"]);
    await page.goto("/#tasks");
    await page
        .getByRole("button", { name: "إجراءات المهمة «مجدولة»", exact: true })
        .click();
    await expect(
        d.getByRole("button", { name: /إلى مهامي اليوم|من مهامي اليوم/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(await readStore(page, "tasks")).toEqual(before);
});
test("المكتمل ينتقل للأسفل ويبقى بعد إعادة التحميل والتراجع يعيد ترتيب الأولويات والمواعيد", async ({
    page,
}) => {
    const a = task("أولوية عليا", "important-urgent");
    const b = {
        ...task("موعد أبكر", "important"),
        schedule: { ...schedule("none"), time: "15:00" },
    };
    const c = {
        ...task("موعد لاحق", "important"),
        schedule: { ...schedule("none"), time: "18:00" },
    };
    await setup(page, [c, task("بلا أولوية"), b, a]);
    await expect(names(page)).toHaveText([
        a.title,
        b.title,
        c.title,
        "بلا أولوية",
    ]);
    await page
        .getByRole("button", { name: "إكمال أولوية عليا", exact: true })
        .click();
    await expect(names(page)).toHaveText([
        b.title,
        c.title,
        "بلا أولوية",
        a.title,
    ]);
    const done = page.locator('[data-task-id="أولوية عليا"]');
    await expect(
        done.getByRole("button", {
            name: "إعادة فتح أولوية عليا",
            exact: true,
        }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(done.locator("strong")).toHaveCSS(
        "text-decoration-line",
        "line-through",
    );
    await page.reload();
    await expect(names(page).last()).toHaveText(a.title);
    await page
        .getByRole("button", { name: "إعادة فتح أولوية عليا", exact: true })
        .click();
    await expect(names(page)).toHaveText([
        a.title,
        b.title,
        c.title,
        "بلا أولوية",
    ]);
    expect(
        (await readStore(page, "events")).filter(
            (e) => e.action === "completed",
        ),
    ).toHaveLength(1);
    expect(
        (await readStore(page, "tasks")).find((t) => t.id === a.id)!.status,
    ).toBe("todo");
    expect(
        (await readStore(page, "steps")).every((s) => s.status === "todo"),
    ).toBe(true);
});
test("المختصر لا يزاحم المفتوح بالمكتمل والعرض الموسع يتيح التراجع", async ({
    page,
}) => {
    await setup(page, [
        task("أ", "important-urgent"),
        task("ب", "important"),
        task("ج", "urgent"),
        task("د", "low"),
        task("هـ"),
    ]);
    await page.goto("/#home");
    await expect(names(page)).toHaveText(["أ", "ب", "ج"]);
    await page.getByRole("button", { name: "إكمال أ", exact: true }).click();
    await expect(names(page)).toHaveText(["ب", "ج", "د"]);
    await page.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await expect(names(page)).toHaveText(["ب", "ج", "د", "هـ", "أ"]);
    await page
        .getByRole("button", { name: "إعادة فتح أ", exact: true })
        .click();
    await expect(names(page)).toHaveText(["أ", "ب", "ج", "د", "هـ"]);
});
for (const repeat of ["daily", "weekly", "monthly"] as const) {
    test(`دورة ${repeat}: إنجاز وتراجع وضغط متكرر وحدود اليوم دون تكرار`, async ({
        page,
    }) => {
        await setup(page, [
            {
                ...task("متكررة", "important-urgent"),
                today: undefined,
                schedule: schedule(repeat),
                scheduleRevision: 1,
                scheduleSince: now,
            },
            task("مفتوحة"),
        ]);
        await page
            .getByRole("button", { name: "إكمال متكررة", exact: true })
            .click();
        await expect(names(page)).toHaveText(["مفتوحة", "متكررة"]);
        const cycleId = (await readStore(page, "taskCycles"))[0].id;
        await page
            .getByRole("button", { name: "إعادة فتح متكررة", exact: true })
            .click();
        await expect(names(page)).toHaveText(["متكررة", "مفتوحة"]);
        // Repeated real clicks on the same stable control exercise the existing queue.
        await page
            .locator('[data-task-id="متكررة"] .task-check')
            .evaluate((el) => {
                for (let i = 0; i < 5; i++) (el as HTMLButtonElement).click();
            });
        await expect(
            page.getByRole("button", { name: "إعادة فتح متكررة", exact: true }),
        ).toHaveAttribute("aria-busy", "false");
        await page.reload();
        await expect(names(page)).toHaveText(["مفتوحة", "متكررة"]);
        expect(
            (await readStore(page, "taskCycles")).filter(
                (c) => c.taskId === "متكررة",
            ),
        ).toHaveLength(1);
        expect(
            (await readStore(page, "tasks")).find((t) => t.id === "متكررة")!
                .status,
        ).toBe("todo");
        await jump(page, "2026-10-17T21:00:00Z");
        if (repeat === "daily") {
            await expect(names(page)).toHaveText(["متكررة"]);
            await expect(
                page.getByRole("button", { name: "إكمال متكررة", exact: true }),
            ).toBeEnabled();
            await expect
                .poll(async () => (await readStore(page, "taskCycles")).length)
                .toBe(2);
        } else {
            await expect(names(page)).toHaveCount(0);
            // The historical completed cycle remains intact; the next cycle is not created early.
            expect((await readStore(page, "taskCycles"))[0]).toMatchObject({
                id: cycleId,
                status: "completed",
            });
        }
    });
}
test("فترة السماح والمتأخرة وإنجاز اليوم المحلي لا يحمل إنجاز الأمس", async ({
    page,
}) => {
    await setup(page, [
        {
            ...task("السبت"),
            today: undefined,
            schedule: schedule("weekly"),
            scheduleRevision: 1,
            scheduleSince: now,
        },
        {
            ...task("متأخرة"),
            today: undefined,
            schedule: schedule("none", "2026-10-16"),
        },
    ]);
    await jump(page, "2026-10-18T09:00:00Z");
    await expect(
        page.getByRole("region", { name: "دورات سابقة ما زالت متاحة" }),
    ).toContainText("السبت");
    await expect(
        page.getByRole("region", { name: "مهام تجاوزت موعدها" }),
    ).toContainText("متأخرة");
    await page
        .getByRole("button", { name: "إكمال السبت", exact: true })
        .click();
    await expect(names(page)).toHaveText(["متأخرة", "السبت"]);
    await jump(page, "2026-10-18T21:00:00Z");
    await expect(names(page)).toHaveText(["متأخرة"]);
    expect((await readStore(page, "taskCycles"))[0].status).toBe("completed");
    await page.goto("/#tasks");
    if ((await page.locator(".completed-list").getAttribute("open")) === null)
        await page.locator(".completed-list summary").click();
    await page
        .getByRole("button", { name: "إعادة فتح السبت", exact: true })
        .click();
    await page.goto("/#today");
    await expect(names(page)).toHaveText(["متأخرة", "السبت"]);
});
test("الحفظ وإعادة فتح المتصفح والعمل دون اتصال يحتفظان بإنجاز اليوم", async ({
    page,
    context,
}) => {
    await setup(page, [task("محلية")]);
    await page
        .getByRole("button", { name: "إكمال محلية", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "إعادة فتح محلية", exact: true }),
    ).toHaveAttribute("aria-busy", "false");
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(
        page.getByRole("button", { name: "إعادة فتح محلية", exact: true }),
    ).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
        page.getByRole("button", { name: "إعادة فتح محلية", exact: true }),
    ).toBeVisible();
    await page
        .getByRole("button", { name: "إعادة فتح محلية", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "إكمال محلية", exact: true }),
    ).toHaveAttribute("aria-busy", "false");
    const reopened = await context.newPage();
    await reopened.clock.install({ time: new Date(now) });
    await reopened.goto("/#today");
    await expect(
        reopened.getByRole("button", { name: "إكمال محلية", exact: true }),
    ).toBeVisible();
    await reopened.close();
    await context.setOffline(false);
});
for (const width of [320, 390, 768, 1366]) {
    test(`العرض ${width}: RTL والثيمان ومحتوى مكتمل وقائمة الإجراءات`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await setup(page, [
            task(
                "عنوان طويل لمهمة اليوم لاختبار واجهة مسار العربية على الجوال واللابتوب",
                "important",
            ),
            task("منجزة"),
        ]);
        await page
            .getByRole("button", { name: "إكمال منجزة", exact: true })
            .click();
        for (const theme of ["dark", "light"]) {
            await page.evaluate((t) => {
                localStorage.setItem("masar-theme", t);
            }, theme);
            await page.reload();
            // Use the app's persisted theme key, asserted below, not emulated CSS alone.
            await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                theme,
            );
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            await page
                .getByRole("button", {
                    name: "إجراءات المهمة «منجزة»",
                    exact: true,
                })
                .click();
            await expect(
                page.getByRole("dialog").getByRole("button", {
                    name: "إزالة من مهامي اليوم",
                    exact: true,
                }),
            ).toBeVisible();
            fs.mkdirSync("docs/today-experience", { recursive: true });
            if (width === 390 && theme === "dark")
                await page.screenshot({
                    path: "docs/today-experience/task-menu-390-dark.png",
                });
            await page.keyboard.press("Escape");
            await page.screenshot({
                path: `docs/today-experience/${width}-${theme}.png`,
                fullPage: true,
            });
        }
    });
}
