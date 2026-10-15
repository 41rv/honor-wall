import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore, openCreate } from "./helpers";
import type { Snapshot } from "../../app/model";
import type { StepWork } from "../../app/paceTypes";
test.use({ timezoneId: "Asia/Riyadh" });
const initial = "2026-09-30T21:00:00.000Z";
async function time(page: Page, at: string) {
    await page.clock.setSystemTime(new Date(at));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
function observed(): Snapshot {
    const data = sizedFixture(40);
    data.tasks = [];
    data.version = 4;
    for (const x of [...data.projects, ...data.steps]) {
        x.createdAt = initial;
        x.updatedAt = initial;
    }
    const work: StepWork[] = Array.from({ length: 28 }, (_, n) => ({
        id: JSON.stringify(["p", n + 1]),
        projectId: "p",
        stepId: `s${n}`,
        order: n + 1,
        complete: true,
        at: `2026-10-${String(Math.floor(n / 2) + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    for (const s of data.steps)
        if (s.kind === "step" && s.order < 28) {
            s.status = "done";
            s.completedAt = work[s.order].at;
        }
    data.projectTracking = [
        {
            projectId: "p",
            since: initial,
            origin: "existing",
            initialPercent: 70,
            lastOrder: 0,
        },
    ];
    data.projectProgress = [];
    data.taskCycles = [];
    data.stepWork = work;
    data.projectPlans = [
        {
            projectId: "p",
            since: initial,
            pauses: [],
            revision: 1,
            workOrder: 28,
            goal: {
                kind: "date",
                anchor: "2026-10-01",
                targetDate: "2026-11-09",
                deadline: "flexible",
                timeZone: "UTC",
            },
        },
    ];
    data.paceSettings = [
        {
            id: "pace",
            activeLimit: 3,
            restHistory: [
                { since: initial, days: [5, 6], timeZone: "Asia/Riyadh" },
            ],
        },
    ];
    data.recommendations = [];
    return data;
}
test("توصية موجودة تختفي بهدوء عند منتصف ليل الرياض وتبقى في التقدم دون إجراءات ملحة", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-15T09:00:00Z") });
    await importData(page, observed());
    await page.goto("/#home");
    await expect(
        page.getByRole("button", { name: "معاينة الاقتراح", exact: true }),
    ).toBeVisible();
    const plans = await readStore(page, "projectPlans");
    const recs = await readStore(page, "recommendations");
    expect(recs.some((r) => r.status === "new")).toBe(true);
    await time(page, "2026-10-15T21:00:00Z");
    await expect(page.locator(".project-rest-notice")).toBeVisible();
    await expect(
        page.getByLabel("التوصية الأبرز", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".daily-project-step")).toHaveCount(0);
    await page.goto("/#progress/recommendations");
    await expect(
        page.getByLabel("سجل توصيات مسار", { exact: true }),
    ).toContainText("محفوظة للمراجعة بعد الراحة");
    await expect(
        page.getByRole("button", { name: "معاينة الاقتراح", exact: true }),
    ).toHaveCount(0);
    expect(await readStore(page, "projectPlans")).toEqual(plans);
    expect(await readStore(page, "recommendations")).toEqual(recs);
    await time(page, "2026-10-17T21:00:00Z");
    await page.goto("/#home");
    await expect(page.locator(".project-rest-notice")).toHaveCount(0);
    await expect(page.locator(".daily-project-steps")).toContainText(
        "اقتراح مرن لليوم: 1 خطوة",
    );
    const next = page.getByRole("button", {
        name: "إتمام الخطوة «خطوة 28»",
        exact: true,
    });
    await expect(next).toBeVisible();
    await expect(next).toHaveCount(1); // Resume shortcut owns this step; no duplicate card action.
    expect(errors).toEqual([]);
});
test("حدود اليوم المحلي: تبدأ الراحة وتستحق المهمة وتتعاقب دوراتها دون تغيير قواعدها", async ({
    page,
}) => {
    await page.clock.install({ time: new Date("2026-10-15T20:59:50Z") });
    await page.goto("/#tasks");
    await openCreate(page, "task");
    const d = page.getByRole("dialog");
    await d.getByLabel("الاسم", { exact: true }).fill("دورة الجمعة المحلية");
    await d.getByLabel("تاريخ التنفيذ", { exact: true }).fill("2026-10-16");
    await d.getByLabel("التكرار", { exact: true }).selectOption("daily");
    await d
        .getByLabel("الأولوية", { exact: true })
        .selectOption("important-urgent");
    await d.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(d).not.toBeVisible();
    await page.goto("/#home");
    await expect(page.locator(".project-rest-notice")).toHaveCount(0);
    await time(page, "2026-10-15T21:00:00Z");
    await expect(page.locator(".project-rest-notice")).toBeVisible();
    await expect(page.locator(".home-today")).toContainText(
        "دورة الجمعة المحلية",
    );
    await page
        .getByRole("button", { name: "إكمال دورة الجمعة المحلية", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "taskCycles")).filter(
                    (c) => c.status === "completed",
                ).length,
        )
        .toBe(1);
    await page
        .getByRole("button", {
            name: "إعادة فتح دورة الجمعة المحلية",
            exact: true,
        })
        .click();
    await page
        .getByRole("button", { name: "إكمال دورة الجمعة المحلية", exact: true })
        .click();
    expect(await readStore(page, "taskCycles")).toHaveLength(1);
    await time(page, "2026-10-16T21:00:00Z");
    await expect
        .poll(async () => (await readStore(page, "taskCycles")).length)
        .toBe(2);
    await expect(page.locator(".project-rest-notice")).toBeVisible();
    await page.reload();
    const cycles = await readStore(page, "taskCycles");
    expect(cycles.filter((c) => c.status === "completed")).toHaveLength(1);
    expect(cycles.filter((c) => c.status === "current")).toHaveLength(1);
});
