import { test, expect, type Page } from "@playwright/test";
import { openCreate, importData, readStore, sizedFixture } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { currentCycle } from "../../app/taskSchedule";
import { validateBackup } from "../../app/model";
function auditFixture(count: number) {
    const data = sizedFixture(count);
    data.exportedAt = "2026-10-14T09:00:00.000Z";
    for (const item of [
        ...data.projects,
        ...data.steps,
        ...data.tasks,
        ...data.ideas,
    ]) {
        item.createdAt = "2026-08-29T21:00:00.000Z";
        item.updatedAt = item.createdAt;
    }
    return data;
}

test.use({ timezoneId: "Asia/Riyadh" });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
const backgrounds = {
    "green-light": "rgb(246, 247, 242)",
    "green-dark": "rgb(16, 27, 23)",
    "mono-light": "rgb(245, 245, 245)",
    "mono-dark": "rgb(18, 18, 18)",
};
for (const unavailable of [false, true])
    test(`بداية تتبع النظام دون React والتخزين ${unavailable ? "محجوب" : "فارغ"}`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        if (unavailable)
            await page.addInitScript(() => {
                Storage.prototype.getItem = () => {
                    throw new DOMException("Blocked", "SecurityError");
                };
                Storage.prototype.setItem = () => {
                    throw new DOMException("Blocked", "SecurityError");
                };
            });
        await page.route(/\/assets\/.*\.(js|css)$/, (route) =>
            route.fulfill({
                status: 200,
                contentType: route.request().url().endsWith(".css")
                    ? "text/css"
                    : "application/javascript",
                body: "",
            }),
        );
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            "dark",
        );
        await expect(page.locator("html")).toHaveCSS(
            "background-color",
            backgrounds["green-dark"],
        );
        await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
            "content",
            "dark",
        );
    });

for (const width of [320, 390, 768, 1366])
    test(`ألوان النظام والخلفيات والثيمات الأربع دون إعادة تشغيل بعرض ${width}`, async ({
        page,
    }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/#home");
        const firstLoad = await page.evaluate(() => performance.timeOrigin);
        for (const identity of ["green", "mono"] as const)
            for (const mode of ["dark", "light"] as const) {
                await page
                    .getByRole("button", {
                        name: "المظهر والألوان",
                        exact: true,
                    })
                    .click();
                await page
                    .getByLabel("الهوية", { exact: true })
                    .selectOption(identity);
                await page
                    .getByLabel("الوضع", { exact: true })
                    .selectOption(mode);
                await page
                    .getByRole("dialog")
                    .getByRole("button", { name: "تم", exact: true })
                    .click();
                for (const route of [
                    "home",
                    "projects",
                    "tasks",
                    "ideas",
                    "progress",
                ]) {
                    await page.evaluate((route) => {
                        location.hash = route;
                    }, route);
                    await expect(page.locator("html")).toHaveAttribute(
                        "data-theme",
                        mode,
                    );
                    const expected = backgrounds[`${identity}-${mode}`];
                    for (const selector of ["html", "body", "#root"])
                        await expect(page.locator(selector)).toHaveCSS(
                            "background-color",
                            expected,
                        );
                    await expect(page.locator("html")).toHaveCSS(
                        "color-scheme",
                        mode,
                    );
                    await expect(
                        page.locator('meta[name="color-scheme"]'),
                    ).toHaveAttribute("content", mode);
                    expect(
                        await page
                            .locator('meta[name="theme-color"]')
                            .getAttribute("content"),
                    ).toBe(
                        await page
                            .locator("html")
                            .evaluate((e) =>
                                getComputedStyle(e)
                                    .getPropertyValue("--bg")
                                    .trim(),
                            ),
                    );
                    expect(
                        await page
                            .locator(".sidebar")
                            .evaluate(
                                (e) => getComputedStyle(e).backgroundColor,
                            ),
                    ).toBe(
                        mode === "light"
                            ? "rgb(255, 255, 255)"
                            : identity === "mono"
                              ? "rgb(30, 30, 30)"
                              : "rgb(25, 39, 34)",
                    );
                    expect(
                        await page.evaluate(
                            () =>
                                document.documentElement.scrollWidth <=
                                innerWidth,
                        ),
                    ).toBe(true);
                    await expect(page.locator("html")).toHaveAttribute(
                        "dir",
                        "rtl",
                    );
                }
                await page.evaluate(() => {
                    location.hash = "home";
                });
                await expect(page.locator(".home-today")).toBeVisible();
                if (width === 390)
                    await page.screenshot({
                        path: `docs/dark-mode-audit/home-${identity}-${mode}-390.png`,
                        fullPage: true,
                    });
            }
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
            firstLoad,
        );
        await page
            .getByRole("button", { name: "المظهر والألوان", exact: true })
            .click();
        await page.getByLabel("الوضع", { exact: true }).selectOption("system");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "تم", exact: true })
            .click();
        await page.emulateMedia({ colorScheme: "dark" });
        await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
            "content",
            "dark",
        );
        await expect(page.locator("body")).toHaveCSS(
            "background-color",
            backgrounds["mono-dark"],
        );
        await page.emulateMedia({ colorScheme: "light" });
        await expect(page.locator("body")).toHaveCSS(
            "background-color",
            backgrounds["mono-light"],
        );
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
            firstLoad,
        );
        await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
    });

test("PWA: لون بدء ثابت غير أبيض وهوية ومسار التثبيت محفوظان", async ({
    request,
}) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.background_color).toBe("#185c4b");
    expect(manifest.theme_color).toBe("#185c4b");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    expect(manifest.display).toBe("standalone");
});

test("المساحة الآمنة السفلية ذات ٢٤ بكسل مغطاة بخلفية داكنة والزر لا يحجب التنقل", async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { bottom: 24 },
    });
    await page.addInitScript(() => localStorage.setItem("masar-theme", "dark"));
    await page.goto("/#home");
    await expect(page.locator(".sidebar")).toHaveCSS("padding-bottom", "24px");
    await expect(page.locator(".sidebar")).toHaveCSS(
        "background-color",
        "rgb(25, 39, 34)",
    );
    expect(
        await page.evaluate(() => {
            const e = document.elementFromPoint(
                innerWidth / 2,
                innerHeight - 2,
            )!;
            return (
                !!e.closest(".sidebar") &&
                getComputedStyle(e).backgroundColor !== "rgb(255, 255, 255)"
            );
        }),
    ).toBe(true);
    const fab = (await page.locator(".mobile-fab").boundingBox())!;
    const nav = (await page.locator(".navigation").boundingBox())!;
    expect(fab.y + fab.height).toBeLessThan(nav.y);
    await page.screenshot({
        path: "docs/dark-mode-audit/safe-area-dark-390.png",
    });
});

test("تكرار التنقل والثيم لا يسرب المستمعين والتبويبات المستقرة لا تعيد قراءات التخزين", async ({
    page,
    context,
}) => {
    test.setTimeout(120000);
    await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
    await importData(page, auditFixture(30));
    await page.goto("/#progress");
    for (const name of ["رؤى مسار", "سجل الإنجاز", "نظرة عامة"])
        await page.getByRole("tab", { name, exact: true }).click();
    const session = await context.newCDPSession(page);
    const listeners = async () =>
        (
            await session.send("Runtime.evaluate", {
                expression:
                    "JSON.stringify([window,document].map(target=>Object.fromEntries(Object.entries(getEventListeners(target)).map(([type,list])=>[type,list.length]))))",
                includeCommandLineAPI: true,
                returnByValue: true,
            })
        ).result.value as string;
    await page.evaluate(() => {
        location.hash = "home";
    });
    await expect(page.locator(".home-today")).toBeVisible();
    const before = await listeners();
    for (let i = 0; i < 12; i++) {
        for (const route of [
            "today",
            "calendar",
            "progress",
            "tasks",
            "home",
        ]) {
            await page.evaluate((route) => {
                location.hash = route;
            }, route);
            await expect(page.locator("h1")).toHaveText(
                {
                    today: "مهامي اليوم",
                    calendar: "التقويم الأسبوعي",
                    progress: "كل خطوة تصنع فرقًا",
                    tasks: "مهامك",
                    home: "يومك، بخطوة واضحة",
                }[route]!,
            );
        }
        await page
            .getByRole("button", {
                name: i % 2 ? "الوضع الفاتح" : "الوضع الداكن",
                exact: true,
            })
            .click();
    }
    await expect(page.locator(".home-today")).toBeVisible();
    const after = await listeners();
    expect(JSON.parse(after)).toEqual(JSON.parse(before));
    await page.evaluate(() => {
        location.hash = "progress";
    });
    for (const name of ["رؤى مسار", "سجل الإنجاز", "نظرة عامة"])
        await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.locator('.achievement-log [role="status"]')).toHaveCount(
        0,
    );
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.getAll;
        (window as unknown as { auditReads: number }).auditReads = 0;
        IDBObjectStore.prototype.getAll = function (...args) {
            (window as unknown as { auditReads: number }).auditReads++;
            return original.apply(this, args);
        };
    });
    for (let i = 0; i < 10; i++)
        for (const name of ["رؤى مسار", "سجل الإنجاز", "نظرة عامة"])
            await page.getByRole("tab", { name, exact: true }).click();
    const reads = await page.evaluate(
        () => (window as unknown as { auditReads: number }).auditReads,
    );
    expect(reads).toBe(0);
    writeFileSync(
        "docs/dark-mode-audit/listeners-and-tabs.json",
        JSON.stringify(
            {
                before: JSON.parse(before),
                after: JSON.parse(after),
                navigationCycles: 12,
                tabChanges: 30,
                getAllReads: reads,
            },
            null,
            2,
        ),
    );
});

test("الرئيسية تتحدث بعد تعديل الموعد والأولوية وتحفظ العدد والمعرف والملاحظات", async ({
    page,
}) => {
    await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
    const data = auditFixture(4);
    for (let i = 0; i < 5; i++)
        data.tasks[i].today = { date: "2026-10-14", timeZone: "Asia/Riyadh" };
    await importData(page, validateBackup(data));
    await page.goto("/#home");
    const home = page.getByRole("region", { name: "مهامي اليوم", exact: true });
    await expect(home.locator(".count")).toHaveText("5");
    await expect(home.locator(".task-row")).toHaveCount(3);
    await page.goto("/#task/t4");
    await page.getByLabel("تعديل الاسم").fill("تعديل ينعكس فورًا");
    await page.getByLabel("ملاحظات العنصر").fill("ملاحظات لا تضيع عند الجدولة");
    await page
        .getByRole("button", { name: "تعديل الموعد والأولوية", exact: true })
        .click();
    const form = page.getByRole("dialog");
    await form.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-14");
    await form.getByLabel("الوقت").fill("14:00");
    await form
        .getByLabel("الأولوية", { exact: true })
        .selectOption("important-urgent");
    await form
        .getByRole("button", { name: "حفظ الإعدادات", exact: true })
        .click();
    await expect(form).not.toBeVisible();
    await page.locator('.navigation a[href="#home"]').click();
    await expect(home.locator(".task-main strong").first()).toHaveText(
        "تعديل ينعكس فورًا",
    );
    await expect(home.locator(".count")).toHaveText("5");
    await home
        .getByRole("button", { name: "إكمال تعديل ينعكس فورًا", exact: true })
        .click();
    await home
        .getByRole("button", {
            name: "إعادة فتح تعديل ينعكس فورًا",
            exact: true,
        })
        .click();
    const task = (await readStore(page, "tasks")).find((t) => t.id === "t4")!;
    expect(task.notes).toBe("ملاحظات لا تضيع عند الجدولة");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("important-urgent");
    await home.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await expect(page.locator(".today-ordered .task-row")).toHaveCount(5);
    await page.goto("/#calendar");
    const day = page.getByRole("region", { name: "2026-10-14", exact: true });
    await expect(
        day.getByRole("link", { name: "تعديل ينعكس فورًا", exact: true }),
    ).toBeVisible();
    await day
        .getByRole("button", {
            name: "إتمام المهمة «تعديل ينعكس فورًا»",
            exact: true,
        })
        .click();
    await page.goto("/#progress");
    await page.getByRole("tab", { name: "سجل الإنجاز", exact: true }).click();
    await expect(page.locator(".achievement-record")).toHaveCount(1);
    await expect(page.locator(".achievement-record")).toContainText(
        "تعديل ينعكس فورًا",
    );
});

test("منتصف الليل والسنة: الأسبوع السبت-الجمعة والاختيارات والتكرار دون دورة خاطئة", async ({
    page,
}) => {
    await page.clock.install({ time: new Date("2026-12-31T20:59:00Z") });
    const data = auditFixture(4);
    data.version = 2;
    data.tasks = data.tasks.slice(0, 4);
    for (const task of data.tasks) {
        task.createdAt = "2026-12-01T09:00:00Z";
        task.updatedAt = task.createdAt;
    }
    data.tasks[0].today = { date: "2026-12-31", timeZone: "Asia/Riyadh" };
    data.tasks[1].schedule = {
        date: "2026-12-31",
        repeat: "none",
        leadDays: 0,
        timeZone: "Asia/Riyadh",
    };
    data.tasks[2].schedule = {
        date: "2026-12-01",
        repeat: "weekly",
        weekdays: [5, 6],
        leadDays: 0,
        timeZone: "Asia/Riyadh",
    };
    data.tasks[3].schedule = {
        date: "2026-12-01",
        repeat: "monthly",
        monthDay: 31,
        leadDays: 0,
        timeZone: "Asia/Riyadh",
    };
    for (const task of data.tasks.slice(1)) {
        task.scheduleRevision = 1;
        task.scheduleSince = "2026-12-01T09:00:00Z";
    }
    data.taskCycles = [];
    await importData(page, validateBackup(data));
    await page.goto("/#calendar");
    await expect(page.locator(".calendar-day")).toHaveCount(7);
    expect(
        await page
            .locator(".calendar-day")
            .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label"))),
    ).toEqual([
        "2026-12-26",
        "2026-12-27",
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
    ]);
    await expect(
        page.getByRole("region", { name: "2026-12-31", exact: true }),
    ).toContainText("مهمة 3");
    const friday = page.getByRole("region", {
        name: "2027-01-01",
        exact: true,
    });
    await expect(friday).toContainText("مهمة 2");
    await expect(
        friday.getByRole("button", {
            name: "إتمام المهمة «مهمة 2»",
            exact: true,
        }),
    ).toBeDisabled();
    await page.goto("/#today");
    await expect(
        page.getByRole("region", { name: "اخترتها لليوم" }),
    ).toContainText("مهمة 0");
    await page.clock.setSystemTime(new Date("2026-12-31T21:00:00Z"));
    await page.clock.setFixedTime(new Date("2026-12-31T21:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".planning-selected")).toHaveCount(0);
    await expect(
        page.getByRole("region", { name: "مهام تجاوزت موعدها" }),
    ).toContainText("مهمة 1");
    const general = (await readStore(page, "tasks")).find(
        (t) => t.id === "t0",
    )!;
    expect(general.status).toBe("todo");
    expect(general.schedule).toBeUndefined();
    await page.goto("/#calendar");
    await expect(friday).toHaveAttribute("data-today", "true");
    await friday
        .getByRole("button", { name: "إتمام المهمة «مهمة 2»", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.taskId === "t2" && c.status === "completed",
                ).length,
        )
        .toBe(1);
    const cycle = (await readStore(page, "taskCycles")).find(
        (c) => c.taskId === "t2" && c.status === "completed",
    )!;
    expect(cycle.start).toBe("2026-12-31T21:00:00.000Z");
    expect(cycle.completedAt).toBe("2026-12-31T21:00:00.000Z");
});

test("بيانات استخدام مختلطة وسجل طويل: تصفية وترقيم صفحات ونسخ واستعادة مرتان بلا ازدواج", async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
    const data = auditFixture(90);
    data.version = 2;
    data.projects.push({
        ...data.projects[0],
        id: "closed",
        title: "مشروع مكتمل",
        status: "closed",
        completedAt: "2026-10-14T09:00:00Z",
    });
    data.projects.push({
        ...data.projects[0],
        id: "archived",
        title: "مشروع مؤرشف",
        archived: true,
    });
    data.steps.push({
        ...data.steps[1],
        id: "closed-leaf",
        projectId: "closed",
        parentId: null,
        title: "عمل مكتمل",
        status: "done",
        completedAt: "2026-10-14T09:00:00Z",
    });
    data.steps.push({
        ...data.steps[1],
        id: "nested",
        parentId: "s0",
        title: "عمل فرعي",
        order: 0,
    });
    data.ideas.push({
        ...data.ideas[0],
        id: "archived-idea",
        title: "فكرة مؤرشفة",
        archived: true,
    });
    const original = data.tasks[0];
    data.tasks = Array.from({ length: 45 }, (_, i) => ({
        ...original,
        id: "done" + i,
        title: "إنجاز " + i,
        status: "done",
        completedAt: "2026-10-14T09:00:00Z",
    }));
    const recurring = {
        ...original,
        id: "recurring",
        title: "دورة تاريخية",
        status: "todo" as const,
        createdAt: "2026-08-29T21:00:00Z",
        updatedAt: "2026-08-29T21:00:00Z",
        scheduleSince: "2026-08-29T21:00:00Z",
        scheduleRevision: 1,
        schedule: {
            date: "2026-08-30",
            repeat: "daily" as const,
            timeZone: "Asia/Riyadh",
            leadDays: 0 as const,
        },
    };
    data.tasks.push(recurring);
    data.taskCycles = Array.from({ length: 45 }, (_, i) => {
        const at = new Date(Date.UTC(2026, 7, 30 + i, 9));
        return {
            ...currentCycle(recurring, at)!,
            status: "completed" as const,
            completedAt: at.toISOString(),
        };
    });
    await importData(page, validateBackup(data));
    await page.goto("/#progress");
    await page.getByRole("tab", { name: "سجل الإنجاز", exact: true }).click();
    await page.getByLabel("عرض السجل").selectOption("all");
    await expect(page.locator(".achievement-record")).toHaveCount(40);
    await page.getByRole("button", { name: /عرض المزيد من الإنجازات/ }).click();
    await expect(page.locator(".achievement-record")).toHaveCount(80);
    await page.getByRole("button", { name: /عرض المزيد من الإنجازات/ }).click();
    await expect(page.locator(".achievement-record")).toHaveCount(92);
    const ids = await page
        .locator(".achievement-record")
        .evaluateAll((es) => es.map((e) => e.getAttribute("data-record-id")));
    expect(new Set(ids).size).toBe(92);
    await page.getByLabel("تصفية سجل الإنجاز").selectOption("cycle");
    await expect(page.locator(".achievement-record")).toHaveCount(40);
    await page.getByRole("button", { name: /عرض المزيد من الإنجازات/ }).click();
    await expect(page.locator(".achievement-record")).toHaveCount(45);
    await page.goto("/#backup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const backup = JSON.parse(
        await (await download).createReadStream().then(async (stream) => {
            const parts: Buffer[] = [];
            for await (const part of stream!) parts.push(Buffer.from(part));
            return Buffer.concat(parts).toString();
        }),
    );
    expect(backup.version).toBe(3);
    const stores = [
        "projects",
        "steps",
        "tasks",
        "ideas",
        "events",
        "taskCycles",
        "projectProgress",
        "projectTracking",
    ] as const;
    for (let i = 0; i < 2; i++) {
        await importData(page, backup);
        for (const store of stores)
            expect(await readStore(page, store)).toEqual(backup[store]);
    }
    await page.reload();
    for (const store of stores)
        expect(await readStore(page, store)).toEqual(backup[store]);
    await page.goto("/#project/p");
    await expect(page.locator(".tree-row")).toHaveCount(92);
    await expect(
        page.locator('[data-step-id="nested"] .tree-number'),
    ).toHaveText("1.1.1");
    await openCreate(page, "idea");
    await page.keyboard.press("Escape");
});
