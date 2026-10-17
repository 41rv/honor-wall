import { appUrl } from "./url";
import { test, expect } from "@playwright/test";
import { openCreate, readStore, importData, sizedFixture } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
test.use({ timezoneId: "Asia/Riyadh" });
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
});
test("الرئيسية: أول ثلاث مهام بالترتيب نفسه دون تغيير الأولويات وإنجاز وتراجع", async ({
    page,
}) => {
    await page.goto(appUrl("/#tasks"));
    for (const [title, priority, time] of [
        ["غير مصنفة", "", ""],
        ["منخفضة", "low", ""],
        ["مهمة هامة", "important", "15:00"],
        ["أهم مهمة", "important-urgent", "16:00"],
        ["هامة أبكر", "important", "14:00"],
    ]) {
        await openCreate(page, "task");
        const f = page.getByRole("dialog");
        await f.getByLabel("الاسم", { exact: true }).fill(title);
        if (priority)
            await f
                .getByLabel("الأولوية", { exact: true })
                .selectOption(priority);
        await f.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-14");
        if (time) await f.getByLabel("الوقت", { exact: false }).fill(time);
        await f.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(f).not.toBeVisible();
    }
    await page.goto(appUrl("/#home"));
    const home = page.getByRole("region", { name: "مهامي اليوم", exact: true });
    await expect(home.locator(".task-main strong")).toHaveText([
        "أهم مهمة",
        "هامة أبكر",
        "مهمة هامة",
    ]);
    const children = page.locator("main > section");
    await expect(children.first()).toHaveAttribute("aria-label", "مهامي اليوم");
    await expect(page.getByLabel("عنوان الفكرة السريعة")).toHaveCount(0);
    await expect(page.getByLabel("بحث شامل")).toHaveCount(0);
    await page
        .getByRole("button", { name: "إكمال أهم مهمة", exact: true })
        .click();
    await home.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await page
        .getByRole("button", { name: "إعادة فتح أهم مهمة", exact: true })
        .click();
    await expect(page).toHaveURL(/#today/);
    await expect(page.locator(".today-ordered .task-main strong")).toHaveText([
        "أهم مهمة",
        "هامة أبكر",
        "مهمة هامة",
        "منخفضة",
        "غير مصنفة",
    ]);
    const gray = page.locator(".task-row").filter({
        has: page.locator(".task-main strong").filter({ hasText: "غير مصنفة" }),
    });
    await expect(gray.locator(".priority-strip")).toHaveCSS(
        "background-color",
        "rgb(139, 146, 157)",
    );
    expect(
        (await readStore(page, "tasks")).find((t) => t.title === "غير مصنفة")!
            .priority,
    ).toBeUndefined();
});
test("الرئيسية الفارغة مختصرة والاستكمال لا يكرر خطوته في بطاقات المشاريع", async ({
    page,
}) => {
    await page.goto(appUrl("/#home"));
    await expect(
        page.getByRole("link", { name: "اختر مهامك لليوم", exact: true }),
    ).toBeVisible();
    await openCreate(page, "project");
    let f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill("مشروع واضح");
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    const p = (await readStore(page, "projects"))[0];
    await page.goto(appUrl("/#project/" + p.id));
    await page.getByRole("button", { name: "خطوة", exact: true }).click();
    f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill("خطوتي الوحيدة");
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    await page.goto(appUrl("/#home"));
    await expect(
        page.getByRole("region", { name: "اختصار الاستكمال" }),
    ).toContainText("خطوتي الوحيدة");
    await expect(
        page.getByRole("button", {
            name: "إتمام الخطوة «خطوتي الوحيدة»",
            exact: true,
        }),
    ).toHaveCount(1);
    await page
        .getByRole("button", { name: "أكمل من حيث توقفت", exact: true })
        .click();
    await expect(page).toHaveURL(/#step\//);
});

test("زر إضافة واحد في الصفحات الخمس: النماذج الأصلية ولوحة المفاتيح والإغلاق", async ({
    page,
}) => {
    for (const route of ["home", "projects", "tasks", "ideas", "progress"]) {
        await page.goto(appUrl("/#" + route));
        const fab = page.getByRole("button", {
            name: "إضافة سريعة",
            exact: true,
        });
        await expect(fab).toHaveCount(1);
        await expect(page.locator(".heading-add")).toHaveCount(0);
        await fab.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("dialog", {
            name: "ماذا تريد أن تضيف؟",
            exact: true,
        });
        await expect(menu).toBeVisible();
        for (const label of ["مشروع جديد", "مهمة جديدة", "فكرة جديدة"])
            await expect(
                menu.getByRole("button", { name: label, exact: true }),
            ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).not.toBeVisible();
        await expect(fab).toBeFocused();
    }
    for (const [kind, title] of [
        ["project", "مشروع"],
        ["task", "مهمة"],
        ["idea", "فكرة"],
    ] as const) {
        await openCreate(page, kind);
        await expect(
            page.getByRole("dialog", { name: "إضافة " + title, exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    }
    await page
        .getByRole("button", { name: "إضافة سريعة", exact: true })
        .click();
    await page.mouse.click(10, 10);
    await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("بطاقة المشروع تحتفظ بالمعلومات ورقم المرحلة والنصوص الأصلية", async ({
    page,
}) => {
    const at = "2026-10-14T09:00:00Z",
        base = { notes: "ملاحظات محفوظة", createdAt: at, updatedAt: at };
    const stageTitle = "عنوان مرحلة طويلة ".repeat(12),
        stepTitle = "خطوة طويلة وواضحة ".repeat(10);
    await importData(page, {
        version: 1,
        exportedAt: at,
        projects: [
            {
                ...base,
                id: "p",
                title: "مشروع طويل ".repeat(10),
                status: "active",
                archived: false,
            },
        ],
        steps: [
            {
                ...base,
                id: "a",
                title: "أول مرحلة",
                projectId: "p",
                parentId: null,
                order: 0,
                kind: "stage",
                status: "done",
                completedAt: at,
            },
            {
                ...base,
                id: "b",
                title: stageTitle,
                projectId: "p",
                parentId: null,
                order: 1,
                kind: "stage",
                status: "todo",
            },
            {
                ...base,
                id: "done",
                title: "خطوة منجزة",
                projectId: "p",
                parentId: "a",
                order: 0,
                kind: "step",
                status: "done",
                completedAt: at,
            },
            {
                ...base,
                id: "next",
                title: stepTitle,
                projectId: "p",
                parentId: "b",
                order: 0,
                kind: "step",
                status: "todo",
            },
        ],
        tasks: [],
        ideas: [],
        events: [],
    });
    await page.goto(appUrl("/#projects"));
    const card = page.locator(".project-card");
    await expect(card).toContainText("نشط");
    await expect(card).toContainText("1 من 2 خطوات مكتملة");
    await expect(card.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await expect(card.locator(".execution-stage")).toHaveText("المرحلة 2");
    await expect(card.locator(".execution-title")).toHaveText(stepTitle.trim());
    await expect(card.locator(".execution-recent")).toContainText("خطوة منجزة");
    await expect(card.locator(".execution-title")).toHaveCSS(
        "-webkit-line-clamp",
        "1",
    );
    expect(
        (await readStore(page, "steps")).find((s) => s.id === "b")!.title,
    ).toBe(stageTitle);
    await card
        .getByRole("button", { name: stepTitle.trim(), exact: true })
        .click();
    await expect(page).toHaveURL(/#step\/next/);
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue(stepTitle);
});

test("تبويبات التقدم تحفظ الفترة والسجل الصحيح والتراجع والرؤى دون ازدواج", async ({
    page,
}) => {
    await page.goto(appUrl("/#tasks"));
    for (const [title, repeat] of [
        ["مهمة للسجل", false],
        ["دورة للسجل", true],
    ] as const) {
        await openCreate(page, "task");
        const f = page.getByRole("dialog");
        await f.getByLabel("الاسم", { exact: true }).fill(title);
        if (repeat)
            await f
                .getByLabel("التكرار", { exact: true })
                .selectOption("daily");
        await f.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(f).not.toBeVisible();
        await page.goto(appUrl("/#tasks"));
        await page
            .getByRole("button", { name: "إكمال " + title, exact: true })
            .click();
    }
    await openCreate(page, "project");
    let f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill("مشروع السجل");
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
    const p = (await readStore(page, "projects"))[0];
    await page.goto(appUrl("/#project/" + p.id));
    for (const title of ["عمل أول", "عمل ثان"]) {
        await page.getByRole("button", { name: "خطوة", exact: true }).click();
        f = page.getByRole("dialog");
        await f.getByLabel("الاسم", { exact: true }).fill(title);
        await f.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(f).not.toBeVisible();
    }
    await page
        .getByRole("button", { name: "إتمام الخطوة «عمل أول»", exact: true })
        .click();
    await page
        .getByRole("button", {
            name: "إتمام المشروع",
            exact: true,
        })
        .click();
    await page.goto(appUrl("/#progress"));
    await expect(
        page.getByRole("tab", { name: "نظرة عامة", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "سنوي", exact: true }).click();
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await expect(
        page.getByRole("region", { name: "رؤى مسار", exact: true }),
    ).toContainText("50٪");
    await expect(
        page.getByRole("img", {
            name: "تغير نسبة إنجاز مشروع السجل عبر الزمن",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "سنوي", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab", { name: "سجل الإنجاز", exact: true }).click();
    await expect(page.locator(".achievement-record")).toHaveCount(4);
    expect(
        new Set(
            await page
                .locator(".achievement-record")
                .evaluateAll((rs) =>
                    rs.map((r) => r.getAttribute("data-record-id")),
                ),
        ).size,
    ).toBe(4);
    await page.getByLabel("تصفية سجل الإنجاز").selectOption("cycle");
    await expect(page.locator(".achievement-record")).toHaveCount(1);
    await expect(page.locator(".achievement-record")).toContainText(
        "دورة للسجل",
    );
    await page.getByLabel("تصفية سجل الإنجاز").selectOption("all");
    await page
        .getByRole("button", { name: "إعادة فتح مهمة للسجل", exact: true })
        .click();
    await expect(page.locator(".achievement-record")).toHaveCount(3);
    await page.getByRole("tab", { name: "نظرة عامة", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "سنوي", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
        page
            .locator(".period-metric")
            .filter({ hasText: "المهام المنجزة" })
            .locator("strong"),
    ).toHaveText("1");
    await page.getByRole("tab", { name: "نظرة عامة", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(
        page.getByRole("tab", { name: "رؤى مسار", exact: true }),
    ).toBeFocused();
    expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
});

for (const width of [320, 390, 768, 1366])
    test(`التصميم بعرض ${width}: الثيمات الأربع وRTL والأزرار والفلاتر وإمكانية الوصول`, async ({
        page,
    }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width, height: 844 });
        const data = sizedFixture(4);
        data.projects[0].title = "عنوان مشروع طويل ".repeat(12);
        data.steps[1].title = "عمل طويل وواضح ".repeat(12);
        for (const t of data.tasks)
            t.today = { date: "2026-10-14", timeZone: "Asia/Riyadh" };
        await importData(page, data);
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
                for (const route of [
                    "home",
                    "projects",
                    "tasks",
                    "ideas",
                    "progress",
                ]) {
                    await page.goto(appUrl("/#" + route));
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
                    const fab = page.getByRole("button", {
                        name: "إضافة سريعة",
                        exact: true,
                    });
                    await expect(fab).toBeVisible();
                    const box = (await fab.boundingBox())!;
                    expect(box.x).toBeGreaterThan(width / 2);
                    const nav = (await page
                        .locator(".navigation")
                        .boundingBox())!;
                    if (width < 761)
                        expect(box.y + box.height).toBeLessThan(nav.y);
                    expect(
                        (
                            await new AxeBuilder({ page })
                                .include("main")
                                .include(".mobile-fab")
                                .analyze()
                        ).violations,
                    ).toEqual([]);
                    if (identity === "green" && mode === "light")
                        await page.screenshot({
                            path: `docs/interface-organization/screenshots/${route}-${width}.png`,
                            fullPage: true,
                        });
                    if (route === "progress")
                        for (const name of ["رؤى مسار", "سجل الإنجاز"]) {
                            await page
                                .getByRole("tab", { name, exact: true })
                                .click();
                            expect(
                                (
                                    await new AxeBuilder({ page })
                                        .include("main")
                                        .analyze()
                                ).violations,
                            ).toEqual([]);
                            expect(
                                await page.evaluate(
                                    () =>
                                        document.documentElement.scrollWidth <=
                                        innerWidth,
                                ),
                            ).toBe(true);
                        }
                }
                await page.goto(appUrl("/#tasks"));
                await page
                    .getByRole("button", { name: "إضافة سريعة", exact: true })
                    .click();
                const menu = page.getByRole("dialog");
                const rect = (await menu.boundingBox())!;
                expect(rect.x).toBeGreaterThanOrEqual(0);
                expect(rect.x + rect.width).toBeLessThanOrEqual(width);
                expect(rect.y).toBeGreaterThanOrEqual(0);
                if (width < 761)
                    expect(rect.y + rect.height).toBeLessThan(
                        (await page.locator(".navigation").boundingBox())!.y,
                    );
                expect(
                    (await new AxeBuilder({ page }).include("dialog").analyze())
                        .violations,
                ).toEqual([]);
                await page.keyboard.press("Escape");
            }
        await page.goto(appUrl("/#tasks"));
        const filters = page.getByRole("group", {
            name: "عرض المهام بحسب موعدها",
        });
        if (width < 761)
            expect(
                await filters.evaluate((e) => e.scrollWidth > e.clientWidth),
            ).toBe(true);
        for (const label of [
            "بدون موعد",
            "اليوم",
            "اقترب الموعد",
            "متأخرة",
            "متكررة",
            "قادمة",
            "كل المهام",
        ]) {
            await filters
                .getByRole("button", { name: label, exact: true })
                .click();
            await expect(
                filters.getByRole("button", { name: label, exact: true }),
            ).toHaveAttribute("aria-pressed", "true");
        }
        await expect(page.locator(".completed-list")).not.toHaveAttribute(
            "open",
        );
    });

test("التبويبات تحفظ المشروع وفلاتر السجل ولا تعدل الجداول الثمانية", async ({
    page,
}) => {
    const data = sizedFixture(2);
    data.projects.push({
        ...data.projects[0],
        id: "another",
        title: "مشروع آخر",
    });
    await importData(page, data);
    await page.goto(appUrl("/#progress"));
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
    const before = await Promise.all(stores.map((s) => readStore(page, s)));
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await page.getByLabel("المشروع للتحليل").selectOption("p");
    await page.getByRole("tab", { name: "سجل الإنجاز", exact: true }).click();
    await page.getByLabel("عرض السجل").selectOption("all");
    await page.getByLabel("تصفية سجل الإنجاز").selectOption("step");
    await page.getByRole("tab", { name: "نظرة عامة", exact: true }).click();
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await expect(page.getByLabel("المشروع للتحليل")).toHaveValue("p");
    await page.getByRole("tab", { name: "سجل الإنجاز", exact: true }).click();
    await expect(page.getByLabel("عرض السجل")).toHaveValue("all");
    await expect(page.getByLabel("تصفية سجل الإنجاز")).toHaveValue("step");
    expect(await Promise.all(stores.map((s) => readStore(page, s)))).toEqual(
        before,
    );
});
