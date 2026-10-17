import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
    openCreate,
    importData as importRaw,
    readStore,
    sizedFixture,
} from "./helpers";
import type { Snapshot, Project, Step } from "../../app/model";
import type { StepWork, ProjectPlan } from "../../app/paceTypes";
const clock = "2026-10-08T00:00:00.000Z",
    since = "2026-10-01T00:00:00.000Z";
test.use({ timezoneId: "UTC" });
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(clock) });
});
function observedFixture(): Snapshot {
    const common = {
        notes: "ملاحظات محفوظة",
        createdAt: since,
        updatedAt: clock,
    };
    const p: Project = {
        ...common,
        id: "p",
        title: "مشروع مرصود",
        status: "active",
        archived: false,
    };
    const work: StepWork[] = Array.from({ length: 14 }, (_, n) => ({
        id: JSON.stringify(["p", n + 1]),
        projectId: "p",
        stepId: `s${n}`,
        order: n + 1,
        at: `2026-10-0${Math.floor(n / 2) + 1}T09:00:00.000Z`,
        complete: true,
    }));
    const steps: Step[] = Array.from({ length: 40 }, (_, n) => ({
        ...common,
        id: `s${n}`,
        title: `رحلة ${n + 1}`,
        projectId: "p",
        parentId: null,
        kind: "step",
        order: n,
        status: n < 14 ? "done" : "todo",
        completedAt: work[n]?.at,
    }));
    const plan: ProjectPlan = {
        projectId: "p",
        since,
        revision: 1,
        workOrder: 14,
        pauses: [],
        goal: {
            kind: "duration",
            days: 40,
            anchor: "2026-10-01",
            targetDate: "2026-11-09",
            deadline: "flexible",
            timeZone: "UTC",
        },
    };
    return {
        version: 4,
        exportedAt: clock,
        projects: [p],
        steps,
        tasks: [
            {
                ...common,
                id: "t",
                title: "مهمة منفصلة",
                status: "todo",
                today: { date: "2026-10-08", timeZone: "UTC" },
                priority: "important",
            },
        ],
        ideas: [],
        events: [],
        taskCycles: [],
        projectProgress: [],
        projectTracking: [
            {
                projectId: "p",
                since: clock,
                origin: "existing",
                initialPercent: 35,
                lastOrder: 0,
            },
        ],
        projectPlans: [plan],
        stepWork: work,
        recommendations: [],
        paceSettings: [{ id: "pace", activeLimit: 3 }],
    };
}
async function importData(page: Page, data: Snapshot) {
    await importRaw(page, data);
    const section = page.locator(".project-rest-settings");
    if ((await section.getAttribute("open")) === null)
        await section.locator("summary").click();
    for (const checkbox of await section.getByRole("checkbox").all())
        await checkbox.uncheck();
    await section
        .getByRole("button", { name: "حفظ أيام الراحة", exact: true })
        .click();
    await expect(section.getByRole("status")).toContainText(
        "حُفظت أيام الراحة",
    );
}
async function goal(
    page: Page,
    kind = "duration",
    value = "20",
    deadline = "flexible",
) {
    await page
        .getByRole("button", { name: "إعداد الهدف الزمني", exact: true })
        .click();
    const dialog = page.getByRole("dialog", { name: "هدف المشروع الزمني" });
    await dialog.getByLabel("نوع الهدف").selectOption(kind);
    if (kind !== "none") {
        await dialog
            .getByLabel(
                kind === "duration" ? "المدة بالأيام" : "التاريخ المستهدف",
                { exact: true },
            )
            .fill(value);
        await dialog.getByLabel("طبيعة الموعد").selectOption(deadline);
    }
    await dialog
        .getByRole("button", { name: "حفظ الهدف", exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
}
test("40/20 من الواجهة: هدف ووتيرة وإنجاز من الرئيسية وتراجع دون خلط المهام", async ({
    page,
}) => {
    const fixture = sizedFixture(40);
    for (const a of [
        fixture.projects,
        fixture.steps,
        fixture.tasks,
        fixture.ideas,
    ])
        for (const x of a) {
            x.createdAt = since;
            x.updatedAt = since;
        }
    await importData(page, fixture);
    await page.goto(appUrl("/#project/p"));
    await goal(page);
    await expect(page.getByLabel("وتيرة المشروع")).toContainText(
        "2 خطوة / يوم",
    );
    const beforeTasks = await readStore(page, "tasks");
    await page.goto(appUrl("/#home"));
    await expect(page.locator("h1")).toHaveText("مهامي اليوم");
    const sections = page.locator("main > section");
    await expect(sections.nth(0)).toHaveAttribute("aria-label", "مهامي اليوم");
    await expect(sections.nth(1)).toHaveAttribute("aria-label", "عاداتي اليوم");
    await expect(sections.nth(2)).toHaveAttribute(
        "aria-label",
        "خطوات مشاريعك القادمة",
    );
    await expect(sections.nth(3)).toHaveAttribute(
        "aria-label",
        "التوصية الأبرز",
    );
    await page
        .getByRole("button", { name: "إتمام الخطوة «خطوة 0»", exact: true })
        .click();
    await expect
        .poll(async () => (await readStore(page, "stepWork")).length)
        .toBe(1);
    expect(
        (await readStore(page, "steps")).find((s) => s.id === "s0")!.status,
    ).toBe("done");
    expect(await readStore(page, "tasks")).toEqual(beforeTasks);
    await page
        .getByRole("button", { name: "تراجع عن إنجاز الخطوة", exact: true })
        .click();
    expect(
        (await readStore(page, "steps")).find((s) => s.id === "s0")!.status,
    ).toBe("todo");
    await page.reload();
    expect((await readStore(page, "projectPlans"))[0].goal).toMatchObject({
        kind: "duration",
        days: 20,
    });
    expect(await readStore(page, "stepWork")).toHaveLength(2);
});
test("تسريع افتراضي: معاينة دون تعديل ثم اعتماد مؤكد وسجل قرار", async ({
    page,
}) => {
    const fixture = observedFixture();
    fixture.projectPlans![0].since = clock;
    fixture.projectPlans![0].workOrder = 0;
    fixture.stepWork = [];
    await importData(page, fixture);
    await page.goto(appUrl("/#project/p"));
    await goal(page, "duration", "40");
    await page.getByRole("button", { name: "معاينة مستويات التسريع" }).click();
    const d = page.getByRole("dialog", { name: "مستويات التسريع" });
    await expect(
        d.getByRole("heading", { name: "ضغط قوي", exact: true }),
    ).toBeVisible();
    await expect(d).toContainText("افتراضي");
    const before = await readStore(page, "projectPlans");
    await d
        .getByRole("button", { name: "معاينة تسريع مريح", exact: true })
        .click();
    expect(await readStore(page, "projectPlans")).toEqual(before);
    await d
        .getByRole("button", { name: "تأكيد اعتماد الخطة" })
        .evaluate((b) => {
            for (let i = 0; i < 8; i++) (b as HTMLButtonElement).click();
        });
    await expect(d).not.toBeVisible();
    expect(await readStore(page, "recommendations")).toHaveLength(1);
    expect((await readStore(page, "recommendations"))[0].status).toBe(
        "accepted",
    );
    expect((await readStore(page, "projectPlans"))[0].approvedPace).toBe(2);
});
test("توصية شخصية: الرئيسية تعرض واحدة والرفض لا يغير الخطة ولا يعود غدًا", async ({
    page,
}) => {
    await importData(page, observedFixture());
    await page.goto(appUrl("/#home"));
    const main = page.getByLabel("التوصية الأبرز", { exact: true });
    await expect(main.locator(".recommendation-card")).toHaveCount(1);
    const before = await readStore(page, "projectPlans");
    await main.getByRole("button", { name: "معاينة الاقتراح" }).click();
    const d = page.getByRole("dialog", { name: "تأكيد تغييرات التوصية" });
    await expect(d).toContainText("استبدال الهدف المرن");
    expect(await readStore(page, "projectPlans")).toEqual(before);
    await d.getByRole("button", { name: "إلغاء", exact: true }).click();
    await main.getByRole("button", { name: "رفض الاقتراح" }).click();
    expect(await readStore(page, "projectPlans")).toEqual(before);
    await page.clock.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(main.locator(".recommendation-card")).toHaveCount(0);
    await page.goto(appUrl("/#progress/recommendations"));
    await page
        .getByRole("button", { name: "عرض سجل القرارات", exact: true })
        .click();
    await expect(page.getByLabel("سجل توصيات مسار")).toContainText("مرفوضة");
});
test("اعتماد توصية شخصية وتحديث مؤشرات المشروع والتراجع عن الخطة من إعداد الهدف", async ({
    page,
}) => {
    await importData(page, observedFixture());
    await page.goto(appUrl("/#project/p"));
    await expect(page.getByLabel("وتيرة المشروع")).toContainText("2026-10-20");
    await page.goto(appUrl("/#home"));
    await page.getByRole("button", { name: "معاينة الاقتراح" }).click();
    await page
        .getByRole("button", { name: "تأكيد اعتماد التغييرات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await readStore(page, "projectPlans"))[0].goal).toMatchObject({
        targetDate: "2026-10-20",
    });
    await page.goto(appUrl("/#project/p"));
    await goal(page, "none");
    const plan = (await readStore(page, "projectPlans"))[0];
    expect(plan.goal).toBeUndefined();
    expect(plan.approvedPace).toBeUndefined();
    expect(await readStore(page, "stepWork")).toHaveLength(14);
});
test("الإيقاف والاستئناف يجمدان20يومًا والموعد الإلزامي لا يتحرك", async ({
    page,
}) => {
    await importData(page, observedFixture());
    await page.goto(appUrl("/#project/p"));
    await goal(page, "duration", "20");
    await page.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    await page
        .getByRole("button", { name: "تأكيد الإيقاف", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.clock.setSystemTime(new Date("2026-10-13T00:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.reload();
    await expect(page.getByLabel("وتيرة المشروع")).toContainText("2026-11-01");
    await page.goto(appUrl("/#home"));
    await expect(page.locator(".home-project")).toHaveCount(0);
    await page.goto(appUrl("/#project/p"));
    await page
        .getByRole("button", { name: "استئناف المشروع", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تأكيد الاستئناف", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("وتيرة المشروع")).toContainText("2026-11-01");
    await goal(page, "date", "2026-11-01", "fixed");
    const fixedGoal = (await readStore(page, "projectPlans"))[0].goal;
    await page
        .getByRole("button", { name: "معاينة مستويات التسريع", exact: true })
        .click();
    await page
        .getByRole("button", { name: "معاينة تسريع مريح", exact: true })
        .click();
    await expect(page.getByLabel("معاينة الخطة")).toContainText(
        "يبقى الموعد الإلزامي",
    );
    await page
        .getByRole("button", { name: "تأكيد اعتماد الخطة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await readStore(page, "projectPlans"))[0].goal).toEqual(fixedGoal);

    await page.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    await page
        .getByRole("button", { name: "تأكيد الإيقاف", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.clock.setSystemTime(new Date("2026-10-18T00:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("وتيرة المشروع")).toContainText("2026-11-01");
    await expect(page.getByLabel("وتيرة المشروع")).toContainText(
        "إلزامي لا يتأجل",
    );
});
test("الحد النشط: الرابع يحتاج قرارًا صريحًا مع حفظ مسودة الإنشاء", async ({
    page,
}) => {
    await page.goto(appUrl("/#projects"));
    for (let i = 1; i <= 3; i++) {
        await openCreate(page, "project");
        const d = page.getByRole("dialog");
        await d.getByLabel("الاسم", { exact: true }).fill(`مشروع ${i}`);
        await d.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(d).not.toBeVisible();
    }
    await openCreate(page, "project");
    const d = page.getByRole("dialog");
    await d.getByLabel("الاسم", { exact: true }).fill("مشروع رابع");
    await d.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(d.getByLabel("خيارات حد المشاريع")).toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(3);
    expect(
        (await readStore(page, "projectPlans")).every(
            (p) => (p.pauses as unknown[]).length === 0,
        ),
    ).toBe(true);
    await d.getByLabel("القرار", { exact: true }).selectOption("limit");
    await d.getByLabel("الحد الجديد", { exact: true }).fill("4");
    await d.getByRole("button", { name: "تأكيد القرار", exact: true }).click();
    await expect
        .poll(
            async () => (await readStore(page, "paceSettings"))[0].activeLimit,
        )
        .toBe(4);
    expect(await readStore(page, "projects")).toHaveLength(3);
    await expect(d.getByLabel("الاسم", { exact: true })).toHaveValue(
        "مشروع رابع",
    );
    await d.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(d).not.toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(4);
    expect((await readStore(page, "paceSettings"))[0].activeLimit).toBe(4);
});
test("الدمج عبر الواجهة يحفظ الأصل ويمنع تكرار الملف ويستعيد الحقول الجديدة", async ({
    page,
}) => {
    const fixture = observedFixture();
    await importData(page, fixture);
    await page.goto(appUrl("/#backup"));
    const merge = async () => {
        await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
            name: "pace.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(fixture)),
        });
        await page
            .getByRole("button", { name: "دمج دون استبدال", exact: true })
            .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    await merge();
    expect(await readStore(page, "projects")).toHaveLength(2);
    await merge();
    expect(await readStore(page, "projects")).toHaveLength(2);
    expect(await readStore(page, "stepWork")).toHaveLength(28);
    await page.reload();
    expect(await readStore(page, "projectPlans")).toHaveLength(2);
});
for (const width of [320, 390, 768, 1366])
    test(`واجهات الوتيرة والجوال والثيمات وRTL وإمكانية الوصول ${width}`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewportSize({ width, height: 900 });
        await importData(page, observedFixture());
        for (const identity of ["green", "mono"])
            for (const mode of ["light", "dark"]) {
                await page.evaluate(
                    ({ identity, mode }) => {
                        localStorage.setItem("masar-identity", identity);
                        localStorage.setItem("masar-theme", mode);
                    },
                    { identity, mode },
                );
                await page.goto(appUrl("/#project/p"));
                await page.reload();
                await expect(page.locator("html")).toHaveAttribute(
                    "dir",
                    "rtl",
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "data-theme",
                    mode,
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "data-identity",
                    identity,
                );
                await expect(page.getByLabel("وتيرة المشروع")).toBeVisible();
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page
                    .getByRole("button", { name: "معاينة مستويات التسريع" })
                    .click();
                await expect(
                    page.getByRole("dialog", { name: "مستويات التسريع" }),
                ).toBeVisible();
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page
                    .getByRole("button", { name: "إغلاق", exact: true })
                    .click();
                if (width === 390 && identity === "green" && mode === "dark") {
                    await page.getByLabel("وتيرة المشروع").screenshot({
                        path: "docs/project-pace/pace-panel-dark-390.png",
                    });
                    await page.screenshot({
                        path: "docs/project-pace/project-dark-390.png",
                        fullPage: true,
                    });
                }
            }
        await page.goto(appUrl("/#home"));
        await expect(page.locator(".home-today")).toBeVisible();
        await page.screenshot({
            path: `docs/project-pace/home-${width}.png`,
            fullPage: true,
        });
        const audit = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
        expect(audit.violations).toEqual([]);
        expect(errors).toEqual([]);
    });

test("إلغاء تجاوز الحد لا ينشئ شيئًا، وإيقاف مشروع بديل قرار منفصل عن الإضافة", async ({
    page,
}) => {
    const f = sizedFixture(2);
    f.projects.push(
        { ...f.projects[0], id: "other", title: "آخر" },
        { ...f.projects[0], id: "third", title: "ثالث" },
    );
    await importData(page, f);
    await page.goto(appUrl("/#projects"));
    const begin = async () => {
        await openCreate(page, "project");
        const d = page.getByRole("dialog");
        await d.getByLabel("الاسم", { exact: true }).fill("رابع محفوظ");
        await d.getByRole("button", { name: "إضافة", exact: true }).click();
        await expect(d.getByLabel("خيارات حد المشاريع")).toBeVisible();
        return d;
    };
    let d = await begin();
    await d.getByRole("button", { name: "إلغاء العملية", exact: true }).click();
    await expect(d).not.toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(3);
    expect(
        (await readStore(page, "projectPlans")).every(
            (p) => (p.pauses as unknown[]).length === 0,
        ),
    ).toBe(true);
    d = await begin();
    await d.getByLabel("القرار", { exact: true }).selectOption("p");
    await d.getByRole("button", { name: "تأكيد القرار", exact: true }).click();
    await expect(d.getByLabel("خيارات حد المشاريع")).toHaveCount(0);
    expect(await readStore(page, "projects")).toHaveLength(3);
    await d.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(d).not.toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(4);
    await page.getByRole("button", { name: /الموقوفة مؤقتًا/ }).click();
    await expect(
        page.locator('.project-card[data-project-id="p"]'),
    ).toContainText("موقوف مؤقتًا");
});
test("استيراد masar.project1 عند الحد يحفظ المعاينة ثم يستورد مرة واحدة بعد القرار", async ({
    page,
}) => {
    const f = sizedFixture(2);
    f.projects.push(
        { ...f.projects[0], id: "other", title: "آخر" },
        { ...f.projects[0], id: "third", title: "ثالث" },
    );
    await importData(page, f);
    await page.goto(appUrl("/#projects"));
    await page
        .getByLabel("استيراد مشروع", { exact: true })
        .setInputFiles("examples/project-import.json");
    const d = page.getByRole("dialog", { name: "معاينة استيراد المشروع" });
    await d
        .getByRole("button", { name: "تأكيد استيراد المشروع", exact: true })
        .click();
    await expect(d.getByLabel("خيارات حد المشاريع")).toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(3);
    await d.getByLabel("القرار", { exact: true }).selectOption("limit");
    await d.getByLabel("الحد الجديد", { exact: true }).fill("4");
    await d.getByRole("button", { name: "تأكيد القرار", exact: true }).click();
    await expect(d.getByLabel("خيارات حد المشاريع")).toHaveCount(0);
    expect(await readStore(page, "projects")).toHaveLength(3);
    await d
        .getByRole("button", { name: "تأكيد استيراد المشروع", exact: true })
        .evaluate((b) => {
            for (let i = 0; i < 8; i++) (b as HTMLButtonElement).click();
        });
    await expect(d).not.toBeVisible();
    expect(await readStore(page, "projects")).toHaveLength(4);
    expect(
        (await readStore(page, "steps"))
            .filter((s) => s.projectId === "p")
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ).toEqual([...f.steps].sort((a, b) => a.id.localeCompare(b.id)));
});
test("إتمام آخر خطوة من الرئيسية ثم التراجع يعيد المشروع والخطوة والمؤشرات ذريًا", async ({
    page,
}) => {
    await importData(page, sizedFixture(1));
    const tasks = await readStore(page, "tasks");
    await page.goto(appUrl("/#home"));
    await page
        .getByRole("button", { name: "إتمام الخطوة «خطوة 0»", exact: true })
        .click();
    await expect
        .poll(async () => (await readStore(page, "projects"))[0].status)
        .toBe("closed");
    await page
        .getByRole("button", { name: "تراجع عن إنجاز الخطوة", exact: true })
        .click();
    await expect
        .poll(async () => (await readStore(page, "projects"))[0].status)
        .toBe("active");
    expect(
        (await readStore(page, "steps")).find((s) => s.id === "s0")!.status,
    ).toBe("todo");
    expect(await readStore(page, "tasks")).toEqual(tasks);
    expect(await readStore(page, "stepWork")).toHaveLength(2);
    await expect(page.locator(".home-project")).toHaveCount(1);
});
test("الداشبورد والرؤى لا يعدّان الإيقاف تعثرًا ويستعيدان العدد بعد الاستئناف", async ({
    page,
}) => {
    await importData(page, observedFixture());
    await page.goto(appUrl("/#project/p"));
    await page.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    await page
        .getByRole("button", { name: "تأكيد الإيقاف", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.clock.setSystemTime(new Date("2026-10-28T00:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.goto(appUrl("/#progress"));
    await page.getByText("تفاصيل المواعيد والمشاريع", { exact: true }).click();
    const active = page
            .locator(".period-metric")
            .filter({ hasText: "مشاريع نشطة الآن" }),
        stalled = page
            .locator(".period-metric")
            .filter({ hasText: "مشاريع بلا تقدم منذ ١٤ يومًا" });
    await expect(active.locator("strong")).toHaveText("0");
    await expect(stalled.locator("strong")).toHaveText("0");
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await expect(
        page.getByRole("region", { name: "رؤى مسار", exact: true }),
    ).toContainText("فترات الإيقاف لا تُعد تباطؤًا");
    await page.goto(appUrl("/#project/p"));
    await page
        .getByRole("button", { name: "استئناف المشروع", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تأكيد الاستئناف", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(appUrl("/#progress"));
    await page.getByRole("tab", { name: "نظرة عامة", exact: true }).click();
    const details = page.locator(".period-details");
    if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
    await expect(active.locator("strong")).toHaveText("1");
    await expect(stalled.locator("strong")).toHaveText("0");
});

test("النافذة فوق مشروع كبير: حصر التركيز وARIA وEscape والرجوع والنقر الخارجي والتنظيف", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript(() => {
        const host = window as typeof window & {
            CloseWatcher: new () => EventTarget & {
                destroy(): void;
                requestClose(): void;
            };
            __qaWatchers?: Array<{ requestClose(): void }>;
        };
        const Native = host.CloseWatcher;
        host.CloseWatcher = class extends Native {
            constructor() {
                super();
                (host.__qaWatchers ??= []).push(this);
            }
        };
    });
    await importData(page, sizedFixture(250));
    await page.goto(appUrl("/#project/p"));
    expect(
        await page.evaluate(() => document.getElementsByTagName("*").length),
    ).toBeGreaterThan(3000);
    const open = page.getByRole("button", {
            name: "إعداد الهدف الزمني",
            exact: true,
        }),
        dialog = page.locator(".dialog-overlay dialog[open]");
    await open.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
    await page.evaluate(() =>
        document.querySelector<HTMLButtonElement>("#root button")!.focus(),
    );
    expect(
        await page.evaluate(
            () =>
                !!document
                    .querySelector("dialog[open]")
                    ?.contains(document.activeElement),
        ),
    ).toBe(true);
    for (let n = 0; n < 12; n++) {
        await page.keyboard.press(n % 2 ? "Shift+Tab" : "Tab");
        expect(
            await page.evaluate(
                () =>
                    !!document
                        .querySelector("dialog[open]")
                        ?.contains(document.activeElement),
            ),
        ).toBe(true);
    }
    const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.evaluate(() => {
        const host = window as typeof window & {
            __qaWatchers: Array<{ requestClose(): void }>;
        };
        host.__qaWatchers.at(-1)!.requestClose();
    });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#root")).not.toHaveAttribute(
        "aria-hidden",
        "true",
    );
    await expect(open).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await open.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await open.click();
    await page.locator(".dialog-overlay").click({ position: { x: 4, y: 4 } });
    await expect(dialog).toHaveCount(0);
    await openCreate(page, "task");
    const create = page.getByRole("dialog");
    await expect(create.getByLabel("الاسم", { exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(create).toHaveCount(0);
    expect(errors).toEqual([]);
});
test("المتصفح بلا CloseWatcher يحتفظ بالنافذة الأصلية وسلوك Escape", async ({
    page,
}) => {
    await page.addInitScript(() => {
        Reflect.set(window, "CloseWatcher", undefined);
    });
    await importData(page, sizedFixture(150));
    await page.goto(appUrl("/#project/p"));
    await page
        .getByRole("button", { name: "إعداد الهدف الزمني", exact: true })
        .click();
    await expect(
        page.getByRole("dialog", { name: "هدف المشروع الزمني" }),
    ).toBeVisible();
    await expect(page.locator(".dialog-overlay")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
});
