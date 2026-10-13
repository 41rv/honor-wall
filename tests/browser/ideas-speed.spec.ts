import { test, expect } from "@playwright/test";
import { largeFixture, importData } from "./helpers";
test("قياس حفظ فكرة مع ألفي فكرة موجودة ومعالج أبطأ", async ({ page }) => {
    test.setTimeout(90000);
    const data = largeFixture();
    const at = new Date().toISOString();
    data.ideas = Array.from({ length: 2000 }, (_, i) => ({
        id: "idea" + i,
        title: "فكرة موجودة " + i,
        notes: "تفاصيل فكرة محفوظة ".repeat(30),
        createdAt: at,
        updatedAt: at,
        archived: false,
    }));
    await importData(page, data);
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto("/#ideas");
    await page.getByRole("button", { name: "الأرشيف", exact: true }).click();
    await page.getByLabel("بحث شامل").fill("بحث لا يطابق الفكرة الجديدة");
    await expect(page.getByText("لم نجد نتيجة")).toBeVisible();
    await page.getByRole("button", { name: "فكرة جديدة", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("فكرة اختبار السرعة");
    const start = Date.now();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
        page.getByRole("button", { name: "فكرة اختبار السرعة", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("بحث شامل")).toHaveValue("");
    const elapsed = Date.now() - start;
    console.log("IDEA_SAVE_MS", elapsed);
    expect(elapsed).toBeLessThan(1500);
    await expect(page.locator(".idea-card")).toHaveCount(30);
    await page.getByRole("button", { name: /عرض المزيد من الأفكار/ }).click();
    await expect(page.locator(".idea-card")).toHaveCount(60);
});
