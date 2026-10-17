import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { importData } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
});
try {
    const context = await browser.newContext({
            baseURL: process.env.MASAR_SCROLL_BASE ?? "http://127.0.0.1:4173",
            timezoneId: "Asia/Riyadh",
            viewport: { width: 390, height: 844 },
        }),
        page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    const d = habitFixture();
    d.habits = [d.habits[1]];
    d.habitPlans = [d.habitPlans[2]];
    d.habitEntries = [d.habitEntries[2]];
    d.habitSuggestions = [];
    d.habitImportReceipts = [];
    for (let i = 0; i < 60; i++) {
        d.habits.push({ ...d.habits[0], id: `h-${i}`, title: `عادة ${i}` });
        d.habitPlans.push({
            ...d.habitPlans[0],
            id: `p-${i}`,
            habitId: `h-${i}`,
        });
    }
    await importData(page, d);
    await page.goto("/#habits");
    await expect(page.locator(".habit-row")).toHaveCount(30);
    await page.getByRole("button", { name: /عرض المزيد من العادات/ }).click();
    await expect(page.locator(".habit-row")).toHaveCount(60);
    const row = page.locator(".habit-row").nth(50);
    await row.scrollIntoViewIfNeeded();
    const target = await row.getAttribute("data-habit-id"),
        yBefore = await page.evaluate(() => scrollY);
    await row.locator(".habit-row-copy a").click();
    await expect(page.locator("main")).toHaveAttribute("data-route", "habit");
    await page.getByRole("button", { name: "الرجوع", exact: true }).click();
    await expect(page).toHaveURL(/#habits$/);
    await expect(page.locator(".habit-row").first()).toBeVisible();
    await page.evaluate(
        () =>
            new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
    );
    const result = {
        target,
        yBefore,
        yAfter: await page.evaluate(() => scrollY),
        rowsAfter: await page.locator(".habit-row").count(),
    };
    fs.writeFileSync(
        "docs/habits-phase3/scroll-result.json",
        JSON.stringify(result, null, 2) + "\n",
    );
    console.log(result);
} finally {
    await browser.close();
}
