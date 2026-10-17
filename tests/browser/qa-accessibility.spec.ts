import { appUrl } from "./url";
import { openCreate } from "./helpers";
import { test, expect } from "@playwright/test";
import { sizedFixture, importData, readStore } from "./helpers";

test("لوحة المفاتيح: النافذة تحصر التركيز وتعيده، وعلامة المهمة تحتفظ به عند انتقالها للمنجزة", async ({
    page,
}) => {
    await importData(page, sizedFixture(10));
    await page.goto(appUrl("/#tasks"));
    const add = page.getByRole("button", { name: "إضافة سريعة", exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "مهمة جديدة", exact: true })
        .click();
    await expect(
        page.getByRole("dialog").getByLabel("الاسم", { exact: true }),
    ).toBeFocused();
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        expect(
            await page.evaluate(
                () => !!document.activeElement?.closest("dialog"),
            ),
        ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(add).toBeFocused();
    const check = page.getByRole("button", {
        name: "إكمال مهمة 0",
        exact: true,
    });
    await check.focus();
    await page.keyboard.press("Space");
    const reopen = page.getByRole("button", {
        name: "إعادة فتح مهمة 0",
        exact: true,
    });
    await expect(reopen).toHaveAttribute("aria-pressed", "true");
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.status,
        )
        .toBe("done");
    await expect(
        page
            .locator(".completed-list")
            .getByRole("button", { name: "إعادة فتح مهمة 0", exact: true }),
    ).toBeVisible();
    await expect(reopen).toBeFocused();
    await page.keyboard.press("Space");
    await expect(check).toHaveAttribute("aria-pressed", "false");
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.status,
        )
        .toBe("todo");
    await expect(check).toBeFocused();
});
test("نافذة في مساحة هاتف قصيرة: الحقول والإضافة متاحة دون حجب، وتقليل الحركة محترم", async ({
    browser,
}) => {
    const context = await browser.newContext({
        viewport: { width: 390, height: 360 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await importData(page, sizedFixture(10));
    await page.goto(appUrl("/#tasks"));
    await openCreate(page, "task", true);
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("إضافة من شاشة قصيرة");
    await expect(page.locator(".mobile-fab")).not.toBeVisible();
    const submit = page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true });
    await submit.scrollIntoViewIfNeeded();
    expect(
        await submit.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return (
                document
                    .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                    ?.closest("button") === el
            );
        }),
    ).toBe(true);
    await submit.tap();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto(appUrl("/#project/p"));
    expect(
        await page
            .locator(".track > span")
            .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await expect(
        page.locator('.navigation a[aria-current="page"]'),
    ).toHaveAttribute("href", "#projects");
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
    ).toBe(true);
    await context.close();
});
