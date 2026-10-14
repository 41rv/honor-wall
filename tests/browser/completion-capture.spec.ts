import { openQuickIdeas } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { largeFixture, importData } from "./helpers";
test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
});
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const messages: string[] = [];
    errors.set(page, messages);
    page.on("pageerror", (e) => messages.push(e.message));
    await page.goto("/");
});
test.afterEach(async ({ page }) => {
    expect(errors.get(page)).toEqual([]);
});
async function small(page: Page) {
    const d = largeFixture();
    d.projects = d.projects.slice(0, 1);
    d.steps = d.steps
        .filter((s) => s.projectId === "p0")
        .slice(0, 22)
        .map((s) => ({ ...s, status: "todo", startedAt: undefined }));
    d.tasks = [];
    d.events = [];
    await importData(page, d);
}
test("التقاط الفكرة في صفحة الأفكار يحفظ باللمس والإدخال والتفاصيل دون فقد", async ({
    page,
}) => {
    await expect(
        page.getByRole("region", { name: "مهامي اليوم", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("region", { name: "التقاط فكرة سريع" }),
    ).toHaveCount(0);
    await openQuickIdeas(page);
    const capture = page.getByRole("region", { name: "التقاط فكرة سريع" });
    await expect(capture).toBeVisible();
    await page.getByLabel("عنوان الفكرة السريعة").fill("فكرة أولى سريعة");
    await page.getByLabel("عنوان الفكرة السريعة").press("Enter");
    await expect(capture.getByRole("status")).toContainText("حُفظت الفكرة");
    await expect(page).toHaveURL(/#ideas/);
    await expect(page.getByLabel("عنوان الفكرة السريعة")).toHaveValue("");
    await page.getByRole("button", { name: "عرض الفكرة", exact: true }).tap();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("فكرة أولى سريعة");
    await openQuickIdeas(page);
    await page.getByLabel("عنوان الفكرة السريعة").fill("فكرة بوصف");
    await page.getByRole("button", { name: "إضافة تفاصيل", exact: true }).tap();
    await page.getByLabel("تفاصيل الفكرة السريعة").fill("تفاصيل لا تضيع");
    await page.getByRole("button", { name: "حفظ الفكرة", exact: true }).tap();
    await expect(page.locator(".capture-saved")).toContainText("حُفظت الفكرة");
    await page.reload();
    await page.goto("/#ideas");
    await page.getByRole("button", { name: "فكرة بوصف", exact: true }).tap();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "تفاصيل لا تضيع",
    );
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});
test("إتمام الخطوة والمرحلة من الشجرة وتحديث الأرقام والسجل ثم إعادة فتحهما", async ({
    page,
}) => {
    await small(page);
    await page.goto("/#project/p0");
    const leaf = page.getByRole("button", {
        name: "إتمام الخطوة «خطوة 0-0»",
        exact: true,
    });
    expect((await leaf.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await leaf.tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "5",
    );
    await page
        .getByRole("button", { name: "إتمام المرحلة «مرحلة 0»", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await expect(
        page.getByRole("button", {
            name: "إعادة فتح المرحلة «مرحلة 0»",
            exact: true,
        }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
        .getByRole("button", {
            name: "إعادة فتح المرحلة «مرحلة 0»",
            exact: true,
        })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page
        .getByRole("button", { name: "مرحلة 0 مرحلة", exact: true })
        .tap();
    await page
        .getByRole("button", { name: "إتمام المرحلة", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    await expect(
        page.getByRole("button", { name: "إعادة فتح المرحلة", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    await page
        .getByRole("button", { name: "إعادة فتح المرحلة", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
});
test("المشروع له زر إتمام في البطاقة والتفاصيل وإتمامه لا يغيّر خطواته", async ({
    page,
}) => {
    await small(page);
    await page.goto("/#projects");
    await page
        .getByRole("button", { name: "إتمام المشروع «مشروع 0»", exact: true })
        .tap();
    await page.getByRole("button", { name: /المغلقة/ }).tap();
    await page
        .getByRole("button", {
            name: "إعادة فتح المشروع «مشروع 0»",
            exact: true,
        })
        .tap();
    await page.getByRole("button", { name: /النشطة/ }).tap();
    await page.getByRole("button", { name: "مشروع 0", exact: true }).tap();
    await page
        .getByRole("button", { name: "إتمام المشروع", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await page.goto("/#progress");
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "المشاريع المغلقة" })
            .locator("strong"),
    ).toHaveText("1");
    await page.goto("/#project/p0");
    await page
        .getByRole("button", { name: "إعادة فتح المشروع", exact: true })
        .tap();
    await expect(
        page.getByRole("button", { name: "إتمام المشروع", exact: true }),
    ).toBeVisible();
});
test("آخر مرحلة تُتمّ المشروع تلقائيًا عند ١٠٠٪ ويبقى الإتمام اليدوي متاحًا عند ٥٠٪", async ({
    page,
}) => {
    await small(page);
    await page.goto("/#project/p0");
    await page.getByLabel("ملاحظات العنصر").fill("ملاحظات مشروع محفوظة");
    await page
        .getByRole("button", { name: "إتمام المرحلة «مرحلة 0»", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await expect(
        page.getByRole("button", { name: "إتمام المشروع", exact: true }),
    ).toBeVisible();
    await page
        .getByRole("button", { name: "إتمام المرحلة «مرحلة 1»", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظات مشروع محفوظة",
    );
    await page
        .getByRole("button", {
            name: "إعادة فتح المرحلة «مرحلة 1»",
            exact: true,
        })
        .tap();
    await page
        .getByRole("button", { name: "إعادة فتح المشروع", exact: true })
        .tap();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await page
        .getByRole("button", { name: "إتمام المشروع", exact: true })
        .tap();
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
    await page.reload();
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
    );
});
test("فشل الإتمام الجماعي لا يترك علامة صح أو حالات جزئية", async ({
    page,
}) => {
    await small(page);
    await page.goto("/#project/p0");
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === "steps" && value.status === "done")
                throw new DOMException(
                    "تعذر إتمام الفرع",
                    "QuotaExceededError",
                );
            return put.call(this, value, key);
        };
    });
    await page
        .getByRole("button", { name: "إتمام المرحلة «مرحلة 0»", exact: true })
        .tap();
    await expect(page.getByRole("status")).toContainText("تعذر إتمام الفرع");
    await expect(
        page.getByRole("button", {
            name: "إتمام المرحلة «مرحلة 0»",
            exact: true,
        }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
});
test("فشل حفظ الفكرة يبقي مسودتها ولا ينشئ نسخًا مكررة", async ({ page }) => {
    await openQuickIdeas(page);
    await page.getByLabel("عنوان الفكرة السريعة").fill("فكرة لا تفقدها");
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (value, key) {
            if (this.name === "ideas")
                throw new DOMException("تعذر حفظ الفكرة", "QuotaExceededError");
            return add.call(this, value, key);
        };
    });
    await page.getByRole("button", { name: "حفظ الفكرة", exact: true }).tap();
    await expect(page.getByRole("alert")).toContainText("تعذر حفظ الفكرة");
    await expect(page.getByLabel("عنوان الفكرة السريعة")).toHaveValue(
        "فكرة لا تفقدها",
    );
    await page.reload();
    await openQuickIdeas(page);
    await expect(page.getByLabel("عنوان الفكرة السريعة")).toHaveValue(
        "فكرة لا تفقدها",
    );
    await page.locator(".quick-idea-capture form").evaluate((form) => {
        form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
        form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    await expect(page.locator(".capture-saved")).toContainText("حُفظت الفكرة");
    await page.goto("/#ideas");
    await expect(
        page.getByRole("button", { name: "فكرة لا تفقدها", exact: true }),
    ).toHaveCount(1);
});
