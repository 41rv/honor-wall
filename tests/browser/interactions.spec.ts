import { performanceTest } from "./performanceHarness";
import { appUrl } from "./url";
import { openCreate } from "./helpers";
import { test, expect } from "@playwright/test";
import { largeFixture, importData } from "./helpers";
test("علامة الإتمام تعمل حتى إذا حدث تحديث للواجهة أثناء الضغط", async ({
    page,
}) => {
    await page.goto(appUrl("/#tasks"));
    await openCreate(page, "task");
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("اختبار علامة الصح");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .click();
    const check = page.getByRole("button", {
        name: "إكمال اختبار علامة الصح",
        exact: true,
    });
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(check).toBeVisible();
    const bounds = (await check.boundingBox())!;
    await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.evaluate(() => {
        (
            document.querySelector(
                '[aria-label="الوضع الداكن"]',
            ) as HTMLButtonElement
        ).click();
    });
    await page.mouse.up();
    await expect(page.locator(".completed-list")).toContainText(
        "اختبار علامة الصح",
    );
});
performanceTest(
    "قياس سرعة الإضافة والتعديل والإتمام بقاعدة كبيرة ومعالج أبطأ",
    async ({ page }) => {
        test.setTimeout(120000);
        await importData(page, largeFixture());
        // This performance scenario adds another active project to a legacy set.
        // Raise capacity explicitly outside the measured operation.
        await page.goto(appUrl("/#projects"));
        await page.getByText("إعداد المشاريع النشطة", { exact: true }).click();
        await page.getByLabel("الحد الأقصى للمشاريع النشطة").fill("30");
        await page
            .getByRole("button", { name: "حفظ حد المشاريع", exact: true })
            .click();
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const times: Record<string, number> = {};
        await page.goto(appUrl("/#projects"));
        await openCreate(page, "project");
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("مشروع اختبار السرعة");
        let started = Date.now();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await page
            .getByRole("button", { name: "مشروع اختبار السرعة", exact: true })
            .waitFor();
        times.project = Date.now() - started;
        await page.goto(appUrl("/#project/p0"));
        await page.getByRole("button", { name: "مرحلة", exact: true }).click();
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("مرحلة السرعة");
        started = Date.now();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        times.stage = Date.now() - started;
        const notes = page.getByLabel("ملاحظات العنصر");
        await notes.scrollIntoViewIfNeeded();
        await expect(notes).toBeInViewport();
        started = Date.now();
        await notes.pressSequentially("ملاحظة اختبار الحفظ والسرعة");
        await expect(page.getByText("محفوظ تلقائيًا")).toBeVisible();
        times.notes = Date.now() - started;

        await page.goto(appUrl("/#tasks"));
        // Hash navigation resolves before React commits the destination. Benchmark
        // completion from a ready task view, as project/stage timing above already
        // does from their open forms. Navigation has its own performance checks.
        await expect(page.locator("main")).toHaveAttribute(
            "data-route",
            "tasks",
        );
        const complete = page.getByRole("button", {
            name: "إكمال مهمة 0",
            exact: true,
        });
        await expect(complete).toBeVisible();
        await page.locator("main").evaluate(async (node) => {
            await Promise.all(
                node
                    .getAnimations()
                    .map((animation) => animation.finished.catch(() => {})),
            );
        });
        // A real click starts with its target in the viewport. Playwright's
        // implicit auto-scroll would otherwise mix list navigation into save time.
        await complete.scrollIntoViewIfNeeded();
        await expect(complete).toBeInViewport();
        started = Date.now();
        await complete.click();
        await expect(page.locator(".completed-list")).toContainText("مهمة 0");
        times.complete = Date.now() - started;
        console.log("PERFORMANCE_MS", JSON.stringify(times));
        expect(times.project).toBeLessThan(1500);
        expect(times.stage).toBeLessThan(1500);
        expect(times.complete).toBeLessThan(1500);
        await test.info().attach("latency.json", {
            body: JSON.stringify(times),
            contentType: "application/json",
        });
    },
);
