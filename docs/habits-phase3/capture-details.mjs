import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { importData } from "../../tests/browser/helpers.ts";
const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
});
try {
    for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({
                baseURL: "http://127.0.0.1:4194",
                timezoneId: "Asia/Riyadh",
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
            }),
            page = await context.newPage();
        await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
        await page.addInitScript(
            (mode) => localStorage.setItem("masar-theme", mode),
            theme,
        );
        const d = habitFixture();
        d.habits = [d.habits[1]];
        d.habitPlans = [d.habitPlans[2]];
        d.habitEntries = [d.habitEntries[2]];
        d.habitSuggestions = [];
        d.habitImportReceipts = [];
        await importData(page, d);
        const close = page.getByRole("button", {
            name: "إخفاء الرسالة",
            exact: true,
        });
        if (await close.isVisible()) await close.click();
        await page.goto("/#habit/bed");
        await expect(
            page.getByRole("region", { name: "تفاصيل العادة", exact: true }),
        ).toBeVisible();
        await page
            .getByLabel("يوم التسجيل", { exact: true })
            .fill("2026-10-05");
        await expect(
            page.locator(".habit-history-edit button"),
        ).toHaveAttribute("aria-pressed", "true");
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
                document.getAnimations().map((a) => a.finished.catch(() => {})),
            );
        });
        await page.screenshot({
            path: `docs/habits-phase3/habit-history-full-${theme}-390.png`,
            fullPage: true,
        });
        await page.locator(".habit-calendar").scrollIntoViewIfNeeded();
        await page.screenshot({
            path: `docs/habits-phase3/calendar-history-${theme}-390.png`,
        });
        await page.goto("/#home");
        const card = page.getByRole("region", {
            name: "عاداتي اليوم",
            exact: true,
        });
        await card
            .getByRole("button", {
                name: "تسجيل عادة «ترتيب السرير»",
                exact: true,
            })
            .click();
        await expect(
            card.getByRole("button", {
                name: "التراجع عن عادة «ترتيب السرير»",
                exact: true,
            }),
        ).toHaveAttribute("aria-busy", "false");
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({
            path: `docs/habits-phase3/home-recorded-${theme}-390.png`,
        });
        await context.close();
    }
    console.log(
        "Captured real full habit history/calendar and recorded home card in light/dark 390px from the final isolated candidate.",
    );
} finally {
    await browser.close();
}
