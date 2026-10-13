import { test, expect } from "@playwright/test";
import { sizedFixture, importData, readStore } from "./helpers";
test("نسخة بمعرّفات نصية خاصة وroot تفتح عناصرها وتحفظ العلاقات والإتمام", async ({
    page,
}) => {
    const data = sizedFixture(1);
    const projectId = "p/ملف%";
    data.projects[0].id = projectId;
    data.steps[0].id = "root";
    data.steps[1].id = "leaf/نسخة%";
    data.steps[1].parentId = "root";
    for (const step of data.steps) step.projectId = projectId;
    await importData(page, data);
    await page.goto("/#projects");
    await page
        .getByRole("button", { name: "مشروع 1 خطوة", exact: true })
        .click();
    await expect(page).toHaveURL(/#project\/p%2F/);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page
        .getByRole("button", { name: "خطوة 0 خطوة", exact: true })
        .click();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("خطوة 0");
    await page
        .getByRole("button", { name: "إتمام الخطوة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "العودة للمشروع", exact: true })
        .click();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
});
test("العودة لمشروع طويل ذي عناوين ملتفة تستعيد الخطوة الظاهرة نفسها", async ({
    page,
}) => {
    const data = sizedFixture(100);
    for (const step of data.steps.slice(1))
        step.title = step.id + " " + "عنوان عربي طويل متكرر ".repeat(12);
    await importData(page, data);
    await page.goto("/#project/p");
    const row = page.locator('[data-step-id="s90"]');
    await row.scrollIntoViewIfNeeded();
    await row.locator(".tree-title").click();
    await expect(page).toHaveURL(/#step\/s90/);
    await page
        .getByRole("button", { name: "العودة للمشروع", exact: true })
        .click();
    await expect(row).toBeInViewport();
    await expect(row.locator(".tree-title")).toContainText("s90");
});
test("فشل التخزين برسالة المتصفح الأصلية يعرض سببًا عربيًا ويحافظ على الحالة ثم يعاود الحفظ", async ({
    page,
}) => {
    await importData(page, sizedFixture(10));
    await page.goto("/#tasks");
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === "tasks" && value.status === "done")
                throw new DOMException(
                    "The quota has been exceeded.",
                    "QuotaExceededError",
                );
            return put.call(this, value, key);
        };
    });
    await page
        .getByRole("button", { name: "إكمال مهمة 0", exact: true })
        .click();
    await expect(page.getByRole("status")).toContainText("مساحة التخزين");
    await expect(
        page.getByRole("button", { name: "إكمال مهمة 0", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
        (await readStore(page, "tasks")).find((t) => t.id === "t0")?.status,
    ).toBe("todo");
    await page.reload();
    await page
        .getByRole("button", { name: "إكمال مهمة 0", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.status,
        )
        .toBe("done");
});

test("الاسم المعدّل يُحفظ عند التنقل دون مغادرة حقل الاسم أولًا", async ({
    page,
}) => {
    await importData(page, sizedFixture(10));
    await page.goto("/#task/t0");
    await page.getByLabel("تعديل الاسم").fill("اسم محفوظ مع الرجوع السريع");
    await page.evaluate(() => {
        location.hash = "#backup";
    });
    await expect(
        page.getByRole("heading", { name: "بياناتك في أمان" }),
    ).toBeVisible();
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.title,
        )
        .toBe("اسم محفوظ مع الرجوع السريع");
    await page.reload();
    await page.goto("/#task/t0");
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue(
        "اسم محفوظ مع الرجوع السريع",
    );
});
test("التراجع المتكرر عن الحذف لا يكرر الاستعادة أو سجل الأحداث", async ({
    page,
}) => {
    await importData(page, sizedFixture(10));
    await page.goto("/#task/t0");
    await page.getByLabel("ملاحظات العنصر").fill("لا تضيع عند الحذف");
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد", exact: true }).click();
    await page
        .getByRole("button", { name: "تراجع", exact: true })
        .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
        });
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).filter((t) => t.id === "t0")
                    .length,
        )
        .toBe(1);
    await expect
        .poll(
            async () =>
                (await readStore(page, "events")).filter(
                    (e) => e.entityId === "t0" && e.action === "reopened",
                ).length,
        )
        .toBe(1);
    await page.goto("/#task/t0");
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "لا تضيع عند الحذف",
    );
});
test("العناوين المكررة والملاحظات الطويلة تبقى مستقلة ويجد البحث النص المختلط", async ({
    page,
}) => {
    const data = sizedFixture(10);
    data.tasks[0].title = data.tasks[1].title = "عنوان مكرر";
    data.tasks[0].notes =
        "تفاصيل عربية English URL https://example.com " +
        "نص طويل ".repeat(1500);
    await importData(page, data);
    await page.goto("/#tasks");
    await expect(
        page.getByRole("button", { name: "إكمال عنوان مكرر", exact: true }),
    ).toHaveCount(2);
    await page.getByLabel("بحث شامل").fill("English URL");
    await page.locator(".search-result").click();
    await expect(page).toHaveURL(/#task\/t0/);
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        data.tasks[0].notes,
    );
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        data.tasks[0].notes,
    );
});
test("ملف استيراد أكبر من الحد لا يستبدل البيانات وتواريخ المنطقة الزمنية صحيحة", async ({
    browser,
}) => {
    const context = await browser.newContext({ timezoneId: "Asia/Riyadh" });
    const page = await context.newPage();
    const data = sizedFixture(10);
    data.tasks[0].createdAt = "2026-10-11T23:59:00.000Z";
    data.tasks[0].updatedAt = data.tasks[0].completedAt =
        "2026-10-12T00:01:00.000Z";
    data.tasks[0].status = "done";
    await importData(page, data);
    await page.goto("/#task/t0");
    await expect(page.locator(".elapsed")).toContainText("أقل من يوم منقضٍ");
    const expected = await page.evaluate(
        (value) =>
            new Intl.DateTimeFormat("ar", {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(new Date(value)),
        data.tasks[0].createdAt,
    );
    await expect(page.locator(".timeline dd").first()).toHaveText(expected);
    await page.goto("/#backup");
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "too-large.json",
        mimeType: "application/json",
        buffer: Buffer.alloc(20 * 1024 * 1024 + 1, "x"),
    });
    await expect(page.getByRole("status")).toContainText("الملف أكبر");
    expect(await readStore(page, "tasks")).toHaveLength(10);
    await context.close();
});
