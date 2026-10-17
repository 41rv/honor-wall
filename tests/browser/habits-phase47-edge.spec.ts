import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { habitFixture } from "../habitFixtures";
import { importData, readStore } from "./helpers";
const out = "docs/habits-phase4-7";
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
});
async function seed(page: Page) {
    const s = habitFixture();
    s.habitSuggestions = s.habitSuggestions!.filter((r) => r.status !== "new");
    await importData(page, s);
    await page.goto(appUrl("/#habit/reading"));
}
test("graded historical editing, tomorrow goal and optional difficulty phase remain separate", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    const oldPlans = await readStore(page, "habitPlans");
    await page
        .getByRole("button", { name: "خيارات العادة أو المسار", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تعديل العادة", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("المستوى الحالي", { exact: true }).fill("3");
    await dialog.locator(".graded-fields summary").click();
    await dialog.getByLabel("الهدف النهائي", { exact: true }).fill("30");
    await expect(
        dialog.getByLabel("وحدة القياس", { exact: true }),
    ).toHaveAttribute("readonly", "");
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    let plans = await readStore(page, "habitPlans");
    expect(plans.filter((p) => p.habitId === "reading")).toHaveLength(3);
    for (const p of oldPlans)
        expect(plans.find((n) => n.id === p.id)).toEqual(p);
    expect(plans.find((p) => p.revision === 3)).toMatchObject({
        effectiveDate: "2026-10-22",
        current: { target: 3 },
        phases: [{ target: 30 }],
    });
    await expect(page.locator(".habit-detail > .habit-row")).toContainText(
        "2 صفحات",
    );
    const history = page.getByRole("region", {
        name: "سجل العادة",
        exact: true,
    });
    await history.getByLabel("يوم التسجيل", { exact: true }).fill("2026-10-05");
    await expect(
        history.getByRole("spinbutton", { name: "كمية «قراءة»", exact: true }),
    ).toHaveValue("1");
    await history
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("5");
    await history.locator(".graded-record summary").click();
    await history.getByRole("combobox").selectOption("hard");
    await history
        .getByRole("button", { name: "تعديل التسجيل", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (
                    (await readStore(page, "habitEntries")).find(
                        (e) => e.id === "read1",
                    )?.result as { amount: number } | undefined
                )?.amount,
        )
        .toBe(5);
    let entries = await readStore(page, "habitEntries");
    expect(entries.find((e) => e.id === "read1")).toMatchObject({
        planId: "hp1",
        recordedAt: "2026-10-05T18:00:00.000Z",
        result: { threshold: 1, unit: "صفحات" },
        difficulty: "hard",
    });
    await history.locator(".graded-record summary").click();
    await history.getByRole("combobox").selectOption("");
    await history
        .getByRole("button", { name: "تعديل التسجيل", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "habitEntries")).find(
                    (e) => e.id === "read1",
                )?.difficulty,
        )
        .toBeUndefined();
    await page
        .getByRole("button", { name: "خيارات العادة أو المسار", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تعديل العادة", exact: true })
        .click();
    await dialog.locator(".graded-fields summary").click();
    await dialog
        .getByRole("button", {
            name: "إضافة مرحلة صعوبة اختيارية",
            exact: true,
        })
        .click();
    await dialog
        .getByLabel("اسم المرحلة", { exact: true })
        .last()
        .fill("استماع");
    await dialog
        .getByLabel("وحدة القياس", { exact: true })
        .last()
        .fill("دقيقة");
    const value = await dialog
        .getByRole("combobox", { name: "المرحلة المعتمدة", exact: true })
        .locator("option")
        .last()
        .getAttribute("value");
    await dialog
        .getByRole("combobox", { name: "المرحلة المعتمدة", exact: true })
        .selectOption(value!);
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    plans = await readStore(page, "habitPlans");
    expect(plans.find((p) => p.revision === 4)).toMatchObject({
        effectiveDate: "2026-10-22",
        current: { target: 1 },
        baseline: { phaseKey: "pages", target: 1 },
    });
    entries = await readStore(page, "habitEntries");
    expect(entries.filter((e) => e.habitId === "reading")).toHaveLength(2);
    await page.screenshot({
        path: `${out}/phase4-history-and-future-390.png`,
        fullPage: true,
        animations: "disabled",
    });
});
for (const width of [320, 390, 768, 1366])
    for (const theme of ["light", "dark"])
        test(`new controls accessibility RTL ${width} ${theme}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(
                (t) => localStorage.setItem("masar-theme", t),
                theme,
            );
            await seed(page);
            await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                theme,
            );
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({
                path: `${out}/phase7-detail-${theme}-${width}.png`,
                animations: "disabled",
            });
            let result = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
            expect(result.violations).toEqual([]);
            await page.goto(appUrl("/#ideas/reminders"));
            await expect(
                page.getByRole("region", { name: "التذكيرات", exact: true }),
            ).toContainText("كتاب للمراجعة");
            result = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
            expect(result.violations).toEqual([]);
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
        });
test("local search locates habits paths and reminders without legacy entity mutations", async ({
    page,
}) => {
    await seed(page);
    for (const [q, label, href] of [
        ["قراءة", "عادة", "#habit/reading"],
        ["المسار الثقافي", "مسار عادات", "#habit-path/culture"],
        ["كتاب للمراجعة", "تذكير", "#ideas/reminders"],
    ]) {
        await page
            .getByRole("textbox", { name: "بحث شامل", exact: true })
            .fill(q);
        const result = page
            .locator(".search-results a.search-result")
            .filter({ hasText: q });
        await expect(result).toContainText(label);
        await expect(result).toHaveAttribute("href", href);
        await result.click();
        await expect(page).toHaveURL(new RegExp(href + "$"));
        // The hash updates before React commits the destination and clears the
        // previous search. Start the next search only when that UI is ready.
        await expect(page.locator("main")).toHaveAttribute("data-route", href.slice(1).split("/")[0]);
        await expect(page.getByRole("textbox", { name: "بحث شامل", exact: true })).toHaveValue("");
    }
});
test("habit form and long lists remain bounded and responsive under4x CPU", async ({
    page,
}) => {
    const s = habitFixture();
    s.habitSuggestions = [];
    s.habitEntries = [];
    s.habits = Array.from({ length: 120 }, (_, i) => ({
        ...s.habits![1],
        id: "load-" + String(i).padStart(3, "0"),
        title: "عادة مستقلة " + i,
    }));
    s.habitPlans = s.habits.map((h, i) => ({
        ...habitFixture().habitPlans![2],
        id: "load-plan-" + i,
        habitId: h.id,
        schedule: { repeat: "daily" },
    }));
    s.habitImportReceipts = [];
    await importData(page, s);
    await page.goto(appUrl("/#habits"));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await expect(page.locator(".habit-row").first()).toBeVisible();
    const rows = await page.locator(".habit-row").count();
    expect(rows).toBeGreaterThanOrEqual(30);
    expect(rows).toBeLessThanOrEqual(60);
    const start = performance.now();
    await page.getByRole("button", { name: "عادة جديدة", exact: true }).click();
    await expect(
        page.getByRole("dialog").getByLabel("اسم العادة", { exact: true }),
    ).toBeEditable();
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(2500);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    fs.writeFileSync(
        `${out}/performance.json`,
        JSON.stringify(
            {
                rows,
                habitCount: 120,
                cpu: 4,
                openFormMs: ms,
                physicalAndroid: false,
            },
            null,
            2,
        ),
    );
});
test("home idle query boundaries stay stable instead of reopening IndexedDB queries on each render", async ({
    page,
}) => {
    await seed(page);
    await page.goto(appUrl("/#home"));
    await expect(
        page.getByRole("region", { name: "ملخص التقدم العام", exact: true }),
    ).toContainText("مهام منجزة هذا الأسبوع");
    await page.evaluate(() => {
        const w = window as unknown as { homeReads: number };
        w.homeReads = 0;
        for (const prototype of [
            IDBObjectStore.prototype,
            IDBIndex.prototype,
        ]) {
            const original = prototype.getAll;
            prototype.getAll = function (...args: Parameters<typeof original>) {
                w.homeReads++;
                return original.apply(this, args);
            };
        }
    });
    await page.waitForTimeout(250);
    const before = await page.evaluate(
        () => (window as unknown as { homeReads: number }).homeReads,
    );
    await page.waitForTimeout(1000);
    const after = await page.evaluate(
        () => (window as unknown as { homeReads: number }).homeReads,
    );
    expect(after - before).toBe(0);
    fs.writeFileSync(
        `${out}/home-idle-reads.json`,
        JSON.stringify(
            { windowMs: 1000, additionalGetAllReads: after - before },
            null,
            2,
        ),
    );
});
test("simultaneous timestamp recording from a second tab updates the first quantity without duplicate rows", async ({
    page,
    context,
}) => {
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await seed(page);
    const first = page.locator(".habit-detail > .habit-row");
    await first
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("2");
    await first.getByRole("button", { name: "سجّل", exact: true }).click();
    await expect(
        first.getByRole("button", { name: "تراجع", exact: true }),
    ).toBeVisible();
    const second = await context.newPage();
    await second.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await second.goto(appUrl("/#habit/reading"));
    const other = second.locator(".habit-detail > .habit-row");
    await expect(
        other.getByRole("spinbutton", { name: "كمية «قراءة»", exact: true }),
    ).toHaveValue("2");
    await other
        .getByRole("spinbutton", { name: "كمية «قراءة»", exact: true })
        .fill("7");
    await other
        .getByRole("button", { name: "تعديل التسجيل", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (
                    (await readStore(page, "habitEntries")).find(
                        (e) =>
                            e.habitId === "reading" &&
                            e.localDate === "2026-10-21",
                    )?.result as { amount: number } | undefined
                )?.amount,
        )
        .toBe(7);
    await expect(
        first.getByRole("spinbutton", { name: "كمية «قراءة»", exact: true }),
    ).toHaveValue("7");
    expect(
        (await readStore(page, "habitEntries")).filter(
            (e) => e.habitId === "reading" && e.localDate === "2026-10-21",
        ),
    ).toHaveLength(1);
});
